export type PaymentMethod = "cod" | "prepaid"

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded"

export type OrderStatus =
  | "placed"
  | "confirmed"
  | "packed"
  | "dispatched"
  | "delivered"
  | "cancelled"
  | "returned"

export type ShipmentStatus =
  | "created"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "rto_initiated"
  | "rto_delivered"
  | "exception"

export interface OrderItem {
  productId: string
  variantId: string
  name: string
  quantity: number
  price: number
  sku?: string
  imageUrl?: string
}

export interface ShippingAddress {
  name: string
  phone: string
  line1: string
  line2?: string
  city: string
  state: string
  pincode: string
  country: string
}

export interface Order {
  id: string
  shopId: string
  customerId?: string
  shopifyOrderId: string
  shopifyOrderName: string
  totalPrice: number
  currency: string
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  items: OrderItem[]
  shippingAddress?: ShippingAddress
  pincode?: string
  status: OrderStatus
  rtoRisk: number
  isRTO: boolean
  createdAt: Date
  updatedAt: Date
}

export interface TrackingEvent {
  timestamp: Date
  location?: string
  status: string
  description: string
}
