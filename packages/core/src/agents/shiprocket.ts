/**
 * Shiprocket MCP — provides Claude with logistics intelligence
 * Queries: tracking status, courier performance, pincode data, remittance status
 */

import axios, { AxiosInstance } from "axios"

export interface ShiprocketAuth {
  email: string
  password: string
}

export interface ShipmentData {
  id: number
  shipment_id: string
  order_id: number
  awb_code: string
  courier: string
  courier_name: string
  status: string
  created_at: string
  updated_at: string
  delivery_status: string
  return_status?: string
  shipment_weight?: number
}

export interface CourierServiceability {
  courier_id: number
  courier_name: string
  courier_code: string
  is_serviceable: boolean
  estimated_delivery_days: number
  charges: number
  etd_max_days: number
}

export interface RemittanceData {
  id: number
  amount: number
  credited_date?: string
  status: string
  transaction_id?: string
}

export interface PincodePerformance {
  pincode: string
  success_rate: number
  rto_rate: number
  avg_delivery_days: number
  couriers_available: string[]
}

export class ShiprocketMCP {
  private api: AxiosInstance
  private token?: string
  private companyId?: number
  private auth: ShiprocketAuth

  constructor(auth: ShiprocketAuth) {
    this.auth = auth
    this.api = axios.create({
      baseURL: "https://apiv2.shiprocket.in/v1/external",
      headers: {
        "Content-Type": "application/json",
      },
    })
  }

  /**
   * Authenticate and get bearer token
   */
  async authenticate(): Promise<void> {
    try {
      const response = await axios.post(
        "https://apiv2.shiprocket.in/v1/external/auth/login",
        {
          email: this.auth.email,
          password: this.auth.password,
        }
      )

      this.token = response.data.token
      this.companyId = response.data.company_id

      // Set token in all future requests
      this.api.defaults.headers.common["Authorization"] = `Bearer ${this.token}`

      console.log(`[ShiprocketMCP] Authenticated as company ${this.companyId}`)
    } catch (error: any) {
      throw new Error(
        `Shiprocket auth failed: ${error.response?.data?.message || error.message}`
      )
    }
  }

  /**
   * Get shipment status and tracking details
   */
  async getShipmentStatus(
    awbCode: string
  ): Promise<ShipmentData | null> {
    try {
      const response = await this.api.get("/shipments", {
        params: {
          awb_code: awbCode,
        },
      })

      return response.data.data?.[0] || null
    } catch (error: any) {
      console.error(`Failed to get shipment ${awbCode}:`, error.message)
      return null
    }
  }

  /**
   * Get all shipments with optional filters
   */
  async getShipments(filters?: {
    status?: string
    courier?: string
    limit?: number
  }): Promise<ShipmentData[]> {
    try {
      const response = await this.api.get("/shipments", {
        params: {
          status: filters?.status,
          courier: filters?.courier,
          limit: filters?.limit || 50,
        },
      })

      return response.data.data || []
    } catch (error: any) {
      console.error("Failed to get shipments:", error.message)
      return []
    }
  }

  /**
   * Get stuck shipments (NDR, RTO, not delivered)
   */
  async getStuckShipments(): Promise<ShipmentData[]> {
    try {
      const response = await this.api.get("/shipments", {
        params: {
          status: "ndr,rto",
          limit: 100,
        },
      })

      return response.data.data || []
    } catch (error: any) {
      console.error("Failed to get stuck shipments:", error.message)
      return []
    }
  }

  /**
   * Get courier serviceability for a pincode
   * Returns available couriers and shipping charges
   */
  async getCourierServiceability(pincode: string, weight: number = 0.5): Promise<CourierServiceability[]> {
    try {
      const response = await this.api.get("/courier/serviceability", {
        params: {
          postcode: pincode,
          weight: weight,
        },
      })

      return response.data.data || []
    } catch (error: any) {
      console.error(`Failed to get serviceability for ${pincode}:`, error.message)
      return []
    }
  }

  /**
   * Request address update from customer
   * Sends WA to customer asking for corrected address
   */
  async requestAddressUpdate(awbCode: string): Promise<boolean> {
    try {
      const response = await this.api.post(
        `/shipments/${awbCode}/address-update-request`,
        {}
      )

      return response.data.success === true
    } catch (error: any) {
      console.error(`Failed to request address update for ${awbCode}:`, error.message)
      return false
    }
  }

  /**
   * Initiate return/RTO for a shipment
   */
  async initiateReturn(awbCode: string): Promise<boolean> {
    try {
      const response = await this.api.post(
        `/shipments/${awbCode}/rto-initiate`,
        {}
      )

      return response.data.success === true
    } catch (error: any) {
      console.error(`Failed to initiate RTO for ${awbCode}:`, error.message)
      return false
    }
  }

  /**
   * Get remittance data (COD payouts)
   */
  async getRemittances(filters?: {
    startDate?: string
    endDate?: string
  }): Promise<RemittanceData[]> {
    try {
      const response = await this.api.get("/remittances", {
        params: {
          start_date: filters?.startDate,
          end_date: filters?.endDate,
        },
      })

      return response.data.data || []
    } catch (error: any) {
      console.error("Failed to get remittances:", error.message)
      return []
    }
  }

  /**
   * Get courier performance data
   * Returns success rate, RTO rate, average delivery days
   */
  async getCourierPerformance(
    courier: string,
    pincode?: string
  ): Promise<{
    success_rate: number
    rto_rate: number
    avg_delivery_days: number
  } | null> {
    try {
      const response = await this.api.get(
        `/courier/${courier}/performance`,
        {
          params: {
            pincode,
          },
        }
      )

      return response.data.data || null
    } catch (error: any) {
      console.error(
        `Failed to get performance for ${courier}:`,
        error.message
      )
      return null
    }
  }

  /**
   * Get pincode-level logistics intelligence
   * Returns which couriers work best in this pincode
   */
  async getPincodeIntelligence(pincode: string): Promise<{
    best_courier: string
    success_rate: number
    rto_rate: number
    avg_delivery_days: number
  } | null> {
    try {
      // Get all couriers available in this pincode
      const couriers = await this.getCourierServiceability(pincode)

      if (!couriers.length) {
        return null
      }

      // Get performance for top couriers
      let bestCourier = couriers[0]
      let bestSuccessRate = 0

      for (const courier of couriers.slice(0, 3)) {
        const perf = await this.getCourierPerformance(
          courier.courier_code,
          pincode
        )
        if (perf && perf.success_rate > bestSuccessRate) {
          bestSuccessRate = perf.success_rate
          bestCourier = courier
        }
      }

      const performance = await this.getCourierPerformance(
        bestCourier.courier_code,
        pincode
      )

      return {
        best_courier: bestCourier.courier_name,
        success_rate: performance?.success_rate || 0,
        rto_rate: performance?.rto_rate || 0,
        avg_delivery_days: performance?.avg_delivery_days || 0,
      }
    } catch (error: any) {
      console.error(`Failed to get pincode intelligence for ${pincode}:`, error.message)
      return null
    }
  }

  /**
   * Get a shipment's full history
   */
  async getShipmentHistory(awbCode: string): Promise<any[]> {
    try {
      const response = await this.api.get(`/shipments/${awbCode}/tracking`)
      return response.data.data || []
    } catch (error: any) {
      console.error(`Failed to get history for ${awbCode}:`, error.message)
      return []
    }
  }
}

/**
 * Initialize and cache Shiprocket MCP instance
 */
let shiprocketInstance: ShiprocketMCP | null = null

export async function getShiprocketMCP(
  auth?: ShiprocketAuth
): Promise<ShiprocketMCP> {
  if (!shiprocketInstance && auth) {
    shiprocketInstance = new ShiprocketMCP(auth)
    await shiprocketInstance.authenticate()
  }

  if (!shiprocketInstance) {
    throw new Error("Shiprocket MCP not initialized. Provide auth credentials.")
  }

  return shiprocketInstance
}
