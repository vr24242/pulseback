import { db } from "@d2c/database"
import Anthropic from "@anthropic-ai/sdk"
import type { CustomerMemory } from "./customer-memory"
import { recordOutcome } from "./outcome-tracker"

const client = new Anthropic()

/**
 * Support Agent (Phase 4.5)
 *
 * Replaces: human agents answering WISMO, reactive support
 *
 * Current: Intent classification, order tracking, return initiation (basic)
 *
 * Target enhancements:
 * 1. Full context recall — load CustomerMemory, never ask for order number
 * 2. Proactive support — shipment delayed >2d, send WA before customer asks
 * 3. Address update — call Shiprocket API to update delivery address in-call
 * 4. Refund processing — initiate with merchant approval above threshold
 * 5. Courier escalation — create Shiprocket support ticket
 * 6. Sentiment escalation — anger/frustration → immediately to human
 * 7. Resolution tracking — did issue resolve? Did they order again? Satisfaction signal.
 *
 * Goal: 90% resolved autonomously, 10% escalated to human, zero bot-frustration.
 * Model routing: Haiku for simple queries, Sonnet for complaints/complex.
 *               NEVER Haiku for angry customers.
 */

export type SupportIntent =
  | "order_status" // where is my order?
  | "return" // how do i return?
  | "refund" // when will i get my money?
  | "address_update" // change delivery address
  | "complaint" // bad experience
  | "damage_report" // product arrived damaged
  | "quality_issue" // product is defective
  | "delivery_date" // when will it arrive?
  | "reorder" // want to buy again
  | "other"

export interface SupportRequest {
  id: string
  customerId: string
  shopId: string
  phone: string
  message: string
  intent?: SupportIntent
  orderId?: string
  sentiment?: "positive" | "neutral" | "negative" | "angry"
  detectedAt: Date
}

export interface SupportResponse {
  message: string
  intent: SupportIntent
  sentiment: string
  actionsTaken: string[]
  requiresEscalation: boolean
  escalationReason?: string
  outcomeRef: string
}

/**
 * Process an inbound support message.
 * Called from api.whatsapp.webhook when customer sends message.
 */
export async function handleSupportRequest(
  request: SupportRequest,
  memory: CustomerMemory,
): Promise<SupportResponse> {
  const outcomeRef = `sup_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  // Step 1: Classify intent + sentiment
  const classification = await classifyRequest(request.message, memory)
  const intent = classification.intent
  const sentiment = classification.sentiment

  // Step 2: Immediate escalation rules
  if (sentiment === "angry" || memory.sentiment === "negative") {
    return {
      message: `Thanks for reaching out. I'm connecting you with our support team right away for immediate help.`,
      intent,
      sentiment,
      actionsTaken: ["escalated_to_human"],
      requiresEscalation: true,
      escalationReason: "Angry or frustrated customer — human needed",
      outcomeRef,
    }
  }

  // Step 3: Route by intent
  let response: SupportResponse = {
    message: "I'll help you.",
    intent,
    sentiment,
    actionsTaken: [],
    requiresEscalation: false,
    outcomeRef,
  }

  switch (intent) {
    case "order_status":
      response = await handleOrderStatus(request, memory, outcomeRef)
      break

    case "return":
      response = await handleReturn(request, memory, outcomeRef)
      break

    case "refund":
      response = await handleRefund(request, memory, outcomeRef)
      break

    case "address_update":
      response = await handleAddressUpdate(request, memory, outcomeRef)
      break

    case "delivery_date":
      response = await handleDeliveryDate(request, memory, outcomeRef)
      break

    case "damage_report":
    case "quality_issue":
      response = await handleComplaint(request, memory, intent, outcomeRef)
      break

    case "complaint":
      response = await handleComplaint(request, memory, "complaint", outcomeRef)
      break

    case "reorder":
      response = await handleReorder(request, memory, outcomeRef)
      break

    default:
      response = await handleGenericQuery(request, memory, outcomeRef)
  }

  return response
}

/**
 * Classify intent and sentiment from message.
 */
async function classifyRequest(
  message: string,
  memory: CustomerMemory,
): Promise<{ intent: SupportIntent; sentiment: string }> {
  const prompt = `Classify this customer support message.

Customer context:
- Orders: ${memory.totalOrders}
- Recent comms ignored: ${memory.hasIgnoredLast3Comms ? "yes" : "no"}
- Sentiment history: ${memory.sentiment}

Message: "${message}"

Respond with JSON: { "intent": "order_status|return|refund|...", "sentiment": "positive|neutral|negative|angry" }

Intent options: order_status, return, refund, address_update, complaint, damage_report, quality_issue, delivery_date, reorder, other
Sentiment: positive (happy), neutral (factual), negative (frustrated), angry (furious/threatening)`

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : "{}"
    const parsed = JSON.parse(text)
    return {
      intent: (parsed.intent || "other") as SupportIntent,
      sentiment: parsed.sentiment || "neutral",
    }
  } catch {
    return { intent: "other", sentiment: "neutral" }
  }
}

/**
 * Handle "where is my order?" queries.
 */
async function handleOrderStatus(
  request: SupportRequest,
  memory: CustomerMemory,
  outcomeRef: string,
): Promise<SupportResponse> {
  const actionsTaken: string[] = []

  // Load relevant orders
  const orders = await db.order.findMany({
    where: { customerId: request.customerId, status: { in: ["pending", "processing", "shipped"] } },
    include: { shipments: { take: 1, orderBy: { createdAt: "desc" } } },
    take: 3,
  })

  if (orders.length === 0) {
    return {
      message: `You don't have any orders in transit right now. Your last order was delivered on ${memory.lastOrderDate?.toLocaleDateString()}. Would you like to place a new order?`,
      intent: "order_status",
      sentiment: "neutral",
      actionsTaken,
      requiresEscalation: false,
      outcomeRef,
    }
  }

  // Build tracking info
  let trackingInfo = ""
  for (const order of orders) {
    const shipment = order.shipments[0]
    if (shipment) {
      trackingInfo += `\n• Order ${order.shopifyOrderId}: ${shipment.status.toUpperCase()}`
      if (shipment.shiprocketAwb) {
        trackingInfo += ` (AWB: ${shipment.shiprocketAwb})`
      }
      if (shipment.expectedDeliveryAt) {
        trackingInfo += ` — Expected by ${shipment.expectedDeliveryAt.toLocaleDateString()}`
      }
    }
  }

  actionsTaken.push("provided_order_status")
  actionsTaken.push("loaded_from_memory") // didn't ask for order number

  return {
    message: `Here's your order status:${trackingInfo}\n\nTrack live: https://pulseback.app/track/${orders[0].id}`,
    intent: "order_status",
    sentiment: "neutral",
    actionsTaken,
    requiresEscalation: false,
    outcomeRef,
  }
}

/**
 * Handle return/refund initiation.
 */
async function handleReturn(
  request: SupportRequest,
  memory: CustomerMemory,
  outcomeRef: string,
): Promise<SupportResponse> {
  const actionsTaken: string[] = []

  // Check eligibility
  const recentDelivered = await db.order.findFirst({
    where: {
      customerId: request.customerId,
      status: "delivered",
      deliveredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { deliveredAt: "desc" },
  })

  if (!recentDelivered) {
    return {
      message: `You don't have any eligible orders for return (must be within 7 days of delivery). Your last order was delivered on ${memory.lastOrderDate?.toLocaleDateString()}.`,
      intent: "return",
      sentiment: "neutral",
      actionsTaken: ["checked_eligibility"],
      requiresEscalation: false,
      outcomeRef,
    }
  }

  actionsTaken.push("found_eligible_order")
  actionsTaken.push("initiated_return_flow")

  return {
    message: `You can return your order from ${recentDelivered.createdAt.toLocaleDateString()}. Start your return here: https://pulseback.app/returns/${request.shopId}?order=${recentDelivered.id}`,
    intent: "return",
    sentiment: "neutral",
    actionsTaken,
    requiresEscalation: false,
    outcomeRef,
  }
}

/**
 * Handle refund status queries.
 */
async function handleRefund(
  request: SupportRequest,
  memory: CustomerMemory,
  outcomeRef: string,
): Promise<SupportResponse> {
  if (!memory.hasPendingRefund) {
    return {
      message: `You don't have any pending refunds. Your last refund was processed on ${memory.lastOrderDate?.toLocaleDateString()}.`,
      intent: "refund",
      sentiment: "neutral",
      actionsTaken: ["checked_refund_status"],
      requiresEscalation: false,
      outcomeRef,
    }
  }

  return {
    message: `You have a refund in progress. It typically takes 5-7 business days to appear in your account after we process it. I'm escalating to our team to check the exact status.`,
    intent: "refund",
    sentiment: "neutral",
    actionsTaken: ["checked_refund_status", "escalated"],
    requiresEscalation: true,
    escalationReason: "Pending refund — customer needs exact status",
    outcomeRef,
  }
}

/**
 * Handle address update requests.
 */
async function handleAddressUpdate(
  request: SupportRequest,
  memory: CustomerMemory,
  outcomeRef: string,
): Promise<SupportResponse> {
  // Find in-transit shipment
  const inTransit = await db.shipment.findFirst({
    where: {
      order: { customerId: request.customerId },
      status: { in: ["in_transit", "failed_delivery"] },
    },
    include: { order: true },
  })

  if (!inTransit) {
    return {
      message: `You don't have any shipments in transit. Once your order is dispatched, you can update the address via the tracking page.`,
      intent: "address_update",
      sentiment: "neutral",
      actionsTaken: [],
      requiresEscalation: false,
      outcomeRef,
    }
  }

  return {
    message: `To update your delivery address for AWB ${inTransit.shiprocketAwb}, please reply with your new address and I'll contact the courier immediately.`,
    intent: "address_update",
    sentiment: "neutral",
    actionsTaken: ["identified_shipment", "prompted_for_new_address"],
    requiresEscalation: false,
    outcomeRef,
  }
}

/**
 * Handle delivery date queries.
 */
async function handleDeliveryDate(
  request: SupportRequest,
  memory: CustomerMemory,
  outcomeRef: string,
): Promise<SupportResponse> {
  const inTransit = await db.shipment.findFirst({
    where: {
      order: { customerId: request.customerId },
      status: { in: ["in_transit", "out_for_delivery"] },
    },
    include: { order: true },
    orderBy: { dispatchedAt: "desc" },
  })

  if (!inTransit || !inTransit.expectedDeliveryAt) {
    return {
      message: `You don't have any orders in transit. Track your order here: https://pulseback.app/track`,
      intent: "delivery_date",
      sentiment: "neutral",
      actionsTaken: [],
      requiresEscalation: false,
      outcomeRef,
    }
  }

  const daysRemaining = Math.ceil(
    (inTransit.expectedDeliveryAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  )

  return {
    message: `Your order should arrive by ${inTransit.expectedDeliveryAt.toLocaleDateString()} (${daysRemaining} days). Track live: https://pulseback.app/track/${inTransit.order.id}`,
    intent: "delivery_date",
    sentiment: "neutral",
    actionsTaken: ["provided_eta"],
    requiresEscalation: false,
    outcomeRef,
  }
}

/**
 * Handle damage/quality complaints.
 */
async function handleComplaint(
  request: SupportRequest,
  memory: CustomerMemory,
  intent: SupportIntent,
  outcomeRef: string,
): Promise<SupportResponse> {
  const actionsTaken = ["initiated_complaint_flow", "escalated"]

  return {
    message: `I'm sorry to hear that. I'm connecting you with our team right away to resolve this. Please share photos of the damage/issue when prompted, and we'll make it right.`,
    intent,
    sentiment: "negative",
    actionsTaken,
    requiresEscalation: true,
    escalationReason: "Damage or quality complaint — human resolution needed",
    outcomeRef,
  }
}

/**
 * Handle reorder requests.
 */
async function handleReorder(
  request: SupportRequest,
  memory: CustomerMemory,
  outcomeRef: string,
): Promise<SupportResponse> {
  const lastOrder = await db.order.findFirst({
    where: { customerId: request.customerId },
    orderBy: { createdAt: "desc" },
  })

  if (!lastOrder) {
    return {
      message: `Start shopping: https://pulseback.app/checkout`,
      intent: "reorder",
      sentiment: "positive",
      actionsTaken: [],
      requiresEscalation: false,
      outcomeRef,
    }
  }

  return {
    message: `You can reorder from your last purchase here: https://pulseback.app/reorder?lastOrder=${lastOrder.id}`,
    intent: "reorder",
    sentiment: "positive",
    actionsTaken: ["provided_reorder_link"],
    requiresEscalation: false,
    outcomeRef,
  }
}

/**
 * Handle generic/other queries.
 */
async function handleGenericQuery(
  request: SupportRequest,
  memory: CustomerMemory,
  outcomeRef: string,
): Promise<SupportResponse> {
  // Use Sonnet for complex queries
  const prompt = `You are a support agent for a D2C e-commerce store in India.
Customer context:
- Name: ${memory.customerId}
- Orders: ${memory.totalOrders}
- Last order: ${memory.lastOrderDate?.toLocaleDateString()}

Customer message: "${request.message}"

Respond conversationally (1-2 sentences). Be helpful and empathetic.`

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    })

    const message = response.content[0].type === "text" ? response.content[0].text : "How can I help?"

    return {
      message,
      intent: "other",
      sentiment: "neutral",
      actionsTaken: ["answered_with_sonnet"],
      requiresEscalation: false,
      outcomeRef,
    }
  } catch {
    return {
      message: `I'm not sure I understood that correctly. Could you rephrase or let me know if you need help with your order status, returns, or refunds?`,
      intent: "other",
      sentiment: "neutral",
      actionsTaken: [],
      requiresEscalation: false,
      outcomeRef,
    }
  }
}

/**
 * Record support interaction outcome.
 * Called when customer responds or issue is resolved.
 */
export async function recordSupportOutcome(
  outcomeRef: string,
  resolved: boolean,
  feedback?: string,
): Promise<void> {
  const outcome = resolved ? "converted" : "ignored"
  await recordOutcome(outcomeRef, outcome, {
    supportResolved: resolved,
    feedback,
  })
}
