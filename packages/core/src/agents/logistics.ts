import { db } from "@d2c/database"
import Anthropic from "@anthropic-ai/sdk"
import type { CustomerMemory } from "./customer-memory"

const client = new Anthropic()

/**
 * Logistics Agent
 *
 * Replaces: manual Shiprocket dashboard monitoring, reactive courier management
 *
 * Capabilities:
 * 1. Shipment Triage — classify every shipment hourly
 * 2. NDR Resolution — per-shipment decision (attempt / address fix / RTO / escalate)
 * 3. Courier Intelligence — per-pincode success rates, auto-route recommendations
 * 4. SLA Monitor — dispatch/delivery SLA tracking, alerts before breach
 * 5. Reverse Logistics — pickup scheduling, return tracking, refund triggering
 */

export interface ShipmentStatus {
  id: string
  awb: string
  status: "on_track" | "at_risk" | "stuck" | "ndr" | "rto" | "delivered"
  carrier: string
  pincode: string
  currentLocation?: string
  lastUpdate: Date
  dispatchedAt: Date
  expectedDeliveryAt?: Date
  failedAttempts: number
}

export interface TriageDecision {
  shipmentId: string
  status: ShipmentStatus["status"]
  reasoning: string
  action?: string // what operator should do
  escalate?: boolean // needs human review
}

export interface NDRDecision {
  shipmentId: string
  nextAction: "attempt" | "address_update" | "rto" | "escalate"
  message: string // what to communicate to customer
  reasoning: string
  priority: "urgent" | "normal"
}

export interface CourierMetrics {
  carrier: string
  pincode: string
  totalShipments: number
  successRate: number // 0-1
  avgDaysToDeliver: number
  rtoRate: number // 0-1
  ndrRate: number // 0-1
  recommendation: "reliable" | "caution" | "avoid"
}

/**
 * Triage a shipment based on current status and history.
 * Called hourly to classify every shipment.
 */
export async function triageShipment(
  shipmentId: string,
  memory: CustomerMemory,
): Promise<TriageDecision> {
  const shipment = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { order: true },
  })

  const now = Date.now()
  const dispatchedMs = shipment.dispatchedAt.getTime()
  const daysSinceDispatch = (now - dispatchedMs) / (24 * 60 * 60 * 1000)

  const status: ShipmentStatus = {
    id: shipment.id,
    awb: shipment.shiprocketAwb,
    status: shipment.status as ShipmentStatus["status"],
    carrier: shipment.carrier,
    pincode: shipment.order.shippingAddress ? parseShippingAddress(shipment.order.shippingAddress).pincode : "",
    lastUpdate: shipment.lastTracked || shipment.dispatchedAt,
    dispatchedAt: shipment.dispatchedAt,
    failedAttempts: shipment.failedAttempts || 0,
  }

  // Triage logic
  let triageStatus: ShipmentStatus["status"] = "on_track"
  let reasoning = ""
  let action: string | undefined
  let escalate = false

  if (shipment.status === "delivered") {
    triageStatus = "delivered"
    reasoning = "Shipment delivered successfully"
  } else if (shipment.status === "rto_initiated") {
    triageStatus = "rto"
    reasoning = "RTO initiated — reverse pickup in progress"
  } else if (shipment.failedAttempts && shipment.failedAttempts >= 3) {
    triageStatus = "stuck"
    reasoning = `Failed delivery attempts: ${shipment.failedAttempts}. Recommend RTO.`
    action = "Initiate return-to-origin"
    escalate = true
  } else if (shipment.failedAttempts && shipment.failedAttempts >= 1) {
    triageStatus = "ndr"
    reasoning = `NDR attempt ${shipment.failedAttempts}. Next action: ${
      shipment.failedAttempts === 1 ? "reattempt" : "contact customer"
    }`
    action = `Send NDR notification (attempt ${shipment.failedAttempts + 1})`
  } else if (daysSinceDispatch > 5) {
    // Delayed shipment
    triageStatus = "at_risk"
    reasoning = `Shipment in transit for ${daysSinceDispatch.toFixed(1)} days. SLA risk.`
    action = "Check with courier, consider expedited delivery"
    escalate = true
  } else if (daysSinceDispatch > 3) {
    triageStatus = "at_risk"
    reasoning = `Approaching delivery SLA (expected ${shipment.expectedDeliveryAt?.toLocaleDateString()})`
    action = "Monitor courier updates"
  } else {
    triageStatus = "on_track"
    reasoning = `On track for delivery. Est. ${shipment.expectedDeliveryAt?.toLocaleDateString()}`
  }

  return {
    shipmentId,
    status: triageStatus,
    reasoning,
    action,
    escalate,
  }
}

/**
 * Decide NDR action for a stuck shipment.
 * Returns: attempt / address_update / rto / escalate
 */
export async function decideNDRAction(
  shipmentId: string,
  memory: CustomerMemory,
): Promise<NDRDecision> {
  const shipment = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { order: true },
  })

  const attempt = (shipment.failedAttempts || 0) + 1

  // Prompt Sonnet to make intelligent NDR decision
  const prompt = `You are a logistics decision system for a D2C store in India.
A shipment failed delivery and needs an action decision.

Shipment:
- AWB: ${shipment.shiprocketAwb}
- Carrier: ${shipment.carrier}
- Pincode: ${shipment.order.shippingAddress}
- Failed attempts: ${attempt}

Customer:
- Orders: ${memory.totalOrders}
- RTO history: ${memory.rtoCount} RTOs
- LTV: ${memory.ltvTier}
- Phone: ${memory.phone}

Decision rules:
1. Attempt 1-2: Reattempt if customer is responsive (high LTV / low RTO history)
2. Attempt 2+: Try address update if customer has phones on file
3. Attempt 3+: Initiate RTO unless customer agrees to alternate delivery
4. VIP customers: Always escalate to ops team for manual handling

Respond in JSON:
{ "action": "attempt|address_update|rto|escalate", "message": "what to tell customer", "priority": "urgent|normal" }`

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : "{}"
    const parsed = JSON.parse(text)

    return {
      shipmentId,
      nextAction: parsed.action || "escalate",
      message: parsed.message || "Contact customer",
      reasoning: `Attempt ${attempt} of 3`,
      priority: parsed.priority || "normal",
    }
  } catch (err) {
    console.error("[LogisticsAgent] NDR decision error:", err)
    // Fallback: escalate on error
    return {
      shipmentId,
      nextAction: "escalate",
      message: "Manual review required",
      reasoning: "Error in NDR decision logic",
      priority: "urgent",
    }
  }
}

/**
 * Get courier performance metrics for a pincode.
 * Used for intelligent routing at order creation time.
 */
export async function getCourierMetrics(
  carrier: string,
  pincode: string,
  days: number = 30,
): Promise<CourierMetrics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const shipments = await db.shipment.findMany({
    where: {
      carrier,
      dispatchedAt: { gte: since },
      order: {
        shippingAddress: {
          contains: pincode,
        },
      },
    },
    select: {
      status: true,
      dispatchedAt: true,
      deliveredAt: true,
      failedAttempts: true,
    },
  })

  const total = shipments.length
  const delivered = shipments.filter(s => s.status === "delivered").length
  const rto = shipments.filter(s => s.status === "rto_initiated").length
  const ndr = shipments.filter(s => (s.failedAttempts || 0) > 0).length

  const successRate = total > 0 ? delivered / total : 0
  const rtoRate = total > 0 ? rto / total : 0
  const ndrRate = total > 0 ? ndr / total : 0

  const deliveryTimes = shipments
    .filter(s => s.deliveredAt && s.dispatchedAt)
    .map(s => (s.deliveredAt!.getTime() - s.dispatchedAt.getTime()) / (24 * 60 * 60 * 1000))
  const avgDaysToDeliver = deliveryTimes.length > 0 ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length : 0

  let recommendation: CourierMetrics["recommendation"] = "reliable"
  if (rtoRate > 0.15 || ndrRate > 0.2) {
    recommendation = "avoid"
  } else if (rtoRate > 0.08 || ndrRate > 0.1) {
    recommendation = "caution"
  }

  return {
    carrier,
    pincode,
    totalShipments: total,
    successRate,
    avgDaysToDeliver,
    rtoRate,
    ndrRate,
    recommendation,
  }
}

/**
 * Get SLA status for a shipment.
 * Returns: on_track, at_risk, breached
 */
export async function checkSLA(shipmentId: string): Promise<{
  status: "on_track" | "at_risk" | "breached"
  daysRemaining?: number
  message: string
}> {
  const shipment = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
  })

  const now = Date.now()
  const dispatchedMs = shipment.dispatchedAt.getTime()
  const daysSinceDispatch = (now - dispatchedMs) / (24 * 60 * 60 * 1000)

  // Standard SLA: 5 days to delivery
  const SLA_DAYS = 5
  const AT_RISK_THRESHOLD = 4

  if (shipment.status === "delivered") {
    const deliveryMs = shipment.deliveredAt?.getTime() || now
    const daysToDeliver = (deliveryMs - dispatchedMs) / (24 * 60 * 60 * 1000)
    return {
      status: daysToDeliver <= SLA_DAYS ? "on_track" : "breached",
      message: `Delivered in ${daysToDeliver.toFixed(1)} days`,
    }
  }

  const daysRemaining = SLA_DAYS - daysSinceDispatch

  if (daysRemaining <= 0) {
    return {
      status: "breached",
      daysRemaining: 0,
      message: "SLA breached — escalate to ops",
    }
  } else if (daysRemaining <= 1) {
    return {
      status: "at_risk",
      daysRemaining,
      message: `SLA breach imminent — ${daysRemaining.toFixed(1)} days remaining`,
    }
  } else {
    return {
      status: "on_track",
      daysRemaining,
      message: `On track — ${daysRemaining.toFixed(1)} days remaining`,
    }
  }
}

/**
 * Helper: parse shipping address JSON
 */
function parseShippingAddress(
  addressJson: Record<string, any>,
): { pincode: string; city: string; state: string } {
  return {
    pincode: addressJson.pincode || "",
    city: addressJson.city || "",
    state: addressJson.state || "",
  }
}
