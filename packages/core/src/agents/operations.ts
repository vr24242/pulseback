import { db } from "@d2c/database"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

/**
 * Operations Agent
 *
 * Replaces: WhatsApp group approvals, manual exception handling, reactive ops
 *
 * Capabilities:
 * 1. Exception Surface — identify the ~10 things per day needing human judgment
 * 2. Approval Workflow — send WA message to merchant, capture decision, execute
 * 3. Policy Enforcement — return window, COD limits, blocked pincodes
 * 4. Inventory Intelligence (future) — sell-through, stockouts, pricing issues
 */

export type ExceptionType =
  | "return_outside_policy" // refund amount > policy
  | "high_rto_pincode" // order to high-risk pincode
  | "unusual_refund_velocity" // multiple refunds same customer/day
  | "vip_escalation" // VIP customer issue
  | "sla_breach" // shipment delivery delayed
  | "large_order_anomaly" // unusual order value
  | "ndr_stuck" // shipment >3 attempts failed
  | "inventory_shortage" // product out of stock after order
  | "policy_override_request" // customer requesting exception

export interface Exception {
  id: string
  type: ExceptionType
  shopId: string
  customerId: string
  orderId?: string
  shipmentId?: string
  severity: "low" | "medium" | "high" | "critical"
  title: string
  description: string
  detectedAt: Date
  requiresApproval: boolean
  autoAction?: string // what PulseOS would do if auto-approved
  metadata: Record<string, any>
}

export interface ApprovalRequest {
  id: string
  exceptionId: string
  type: ExceptionType
  title: string
  description: string
  recommendation: string
  options: { label: string; action: string }[]
  urgency: "low" | "normal" | "urgent"
  timeout?: number // seconds before auto-decline
}

export interface ApprovalDecision {
  exceptionId: string
  decision: "approved" | "declined" | "timed_out"
  selectedAction?: string
  notes?: string
  decidedAt: Date
  decidedBy: "merchant" | "system"
}

/**
 * Detect exceptions that need human judgment.
 * Run hourly to populate exception queue.
 */
export async function detectExceptions(shopId: string): Promise<Exception[]> {
  const exceptions: Exception[] = []
  const now = new Date()

  // Exception 1: Returns outside policy
  const oversizedReturns = await db.returnRequest.findMany({
    where: {
      order: { shopId },
      status: "pending",
      requestedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    include: { order: true },
    take: 100,
  })

  for (const ret of oversizedReturns) {
    if (ret.refundAmount && ret.refundAmount > ret.order.totalAmount * 0.9) {
      exceptions.push({
        id: `exc_${ret.id}`,
        type: "return_outside_policy",
        shopId,
        customerId: ret.order.customerId,
        orderId: ret.order.id,
        severity: "medium",
        title: `Return ₹${ret.refundAmount} on order ₹${ret.order.totalAmount}`,
        description: `Customer requesting full refund or near-full. Outside policy.`,
        detectedAt: now,
        requiresApproval: true,
        autoAction: "Decline with offer of 20% credit",
        metadata: { refundAmount: ret.refundAmount, policyMax: ret.order.totalAmount * 0.8 },
      })
    }
  }

  // Exception 2: Unusual refund velocity
  const recentRefunds = await db.returnRequest.findMany({
    where: {
      order: { shopId },
      status: "approved",
      approvedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    include: { order: true },
  })

  const refundsByCustomer = new Map<string, number>()
  for (const ref of recentRefunds) {
    const count = (refundsByCustomer.get(ref.order.customerId) ?? 0) + 1
    refundsByCustomer.set(ref.order.customerId, count)
  }

  for (const [customerId, count] of refundsByCustomer.entries()) {
    if (count >= 3) {
      exceptions.push({
        id: `exc_fraud_${customerId}`,
        type: "unusual_refund_velocity",
        shopId,
        customerId,
        severity: "high",
        title: `${count} refunds in 24 hours`,
        description: `Potential refund fraud or systematic issue`,
        detectedAt: now,
        requiresApproval: true,
        autoAction: "Flag account for review",
        metadata: { refundCount: count },
      })
    }
  }

  // Exception 3: VIP escalation (if any VIP customer has pending issue)
  const vipIssues = await db.customer.findMany({
    where: { shopId, ltvTier: "vip" },
    include: {
      orders: { where: { hasOpenNDR: true }, take: 1 },
    },
    take: 50,
  })

  for (const vip of vipIssues) {
    if (vip.orders.length > 0) {
      exceptions.push({
        id: `exc_vip_${vip.id}`,
        type: "vip_escalation",
        shopId,
        customerId: vip.id,
        orderId: vip.orders[0].id,
        severity: "critical",
        title: `VIP customer with stuck shipment`,
        description: `${vip.name} (₹${vip.totalSpend} lifetime) has NDR shipment. Needs immediate attention.`,
        detectedAt: now,
        requiresApproval: true,
        autoAction: "Contact customer + expedite",
        metadata: { ltvTier: "vip", totalSpend: vip.totalSpend },
      })
    }
  }

  // Exception 4: SLA breaches
  const slaBreaches = await db.shipment.findMany({
    where: {
      status: { not: "delivered" },
      dispatchedAt: { lt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) },
    },
    include: { order: true },
    take: 50,
  })

  for (const shipment of slaBreaches) {
    exceptions.push({
      id: `exc_sla_${shipment.id}`,
      type: "sla_breach",
      shopId,
      orderId: shipment.order.id,
      shipmentId: shipment.id,
      severity: "high",
      title: `SLA breach: ${shipment.shiprocketAwb}`,
      description: `Shipment in transit for 5+ days. Last update: ${shipment.lastTracked?.toLocaleDateString()}`,
      detectedAt: now,
      requiresApproval: true,
      autoAction: "Check with courier",
      metadata: { awb: shipment.shiprocketAwb, carrier: shipment.carrier },
    })
  }

  return exceptions
}

/**
 * Create an approval request from an exception.
 * Sent to merchant via WhatsApp.
 */
export async function createApprovalRequest(exception: Exception): Promise<ApprovalRequest> {
  const shop = await db.shop.findUniqueOrThrow({ where: { id: exception.shopId } })

  let recommendation = ""
  let options: ApprovalRequest["options"] = []

  switch (exception.type) {
    case "return_outside_policy":
      recommendation = "Decline refund, offer store credit instead"
      options = [
        { label: "Approve full refund", action: "approve_full_refund" },
        { label: "Approve 80% refund", action: "approve_partial_refund" },
        { label: "Offer 20% store credit", action: "offer_store_credit" },
        { label: "Decline return", action: "decline_return" },
      ]
      break

    case "vip_escalation":
      recommendation = "Reach out immediately to VIP customer"
      options = [
        { label: "Contact & expedite", action: "contact_expedite" },
        { label: "Send gift voucher", action: "send_gift_voucher" },
        { label: "Initiate return", action: "initiate_rto" },
      ]
      break

    case "sla_breach":
      recommendation = "Contact courier, escalate if needed"
      options = [
        { label: "Check with courier", action: "check_courier" },
        { label: "Initiate return", action: "initiate_rto" },
        { label: "Offer compensation", action: "offer_compensation" },
      ]
      break

    case "unusual_refund_velocity":
      recommendation = "Review customer account for fraud"
      options = [
        { label: "Approve remaining", action: "approve" },
        { label: "Freeze account", action: "freeze_account" },
        { label: "Request clarification", action: "request_clarification" },
      ]
      break

    default:
      recommendation = "Review and decide"
      options = [
        { label: "Approve", action: "approve" },
        { label: "Decline", action: "decline" },
      ]
  }

  return {
    id: `apr_${exception.id}`,
    exceptionId: exception.id,
    type: exception.type,
    title: exception.title,
    description: exception.description,
    recommendation,
    options,
    urgency: exception.severity === "critical" ? "urgent" : "normal",
    timeout: exception.severity === "critical" ? 3600 : 86400, // 1h for critical, 24h for others
  }
}

/**
 * Record a merchant decision on an approval request.
 */
export async function recordApprovalDecision(decision: ApprovalDecision): Promise<void> {
  // Store decision in DB (extend Communication schema or create new ApprovalLog)
  console.log(`[OperationsAgent] decision recorded:`, {
    exceptionId: decision.exceptionId,
    decision: decision.decision,
    action: decision.selectedAction,
  })

  // TODO: Execute the selected action based on decision.selectedAction
  // - approve_full_refund → call Shiprocket reverse pickup
  // - offer_store_credit → create credit code
  // - contact_expedite → queue WA to customer
  // etc.
}

/**
 * Policy enforcement — check if action is allowed by merchant policy.
 */
export async function checkPolicyCompliance(
  shopId: string,
  action: "approve_return" | "block_cod" | "offer_discount",
  context?: Record<string, any>,
): Promise<{
  allowed: boolean
  reason?: string
  alternativeAction?: string
}> {
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } })

  switch (action) {
    case "approve_return":
      // Check return window: 7 days for most, 14 days for clothing
      const orderDate = context?.orderDate ? new Date(context.orderDate) : new Date()
      const daysSince = (Date.now() - orderDate.getTime()) / (24 * 60 * 60 * 1000)
      const window = context?.productType === "clothing" ? 14 : 7

      if (daysSince > window) {
        return {
          allowed: false,
          reason: `Return window closed (${window} days, ${daysSince.toFixed(1)} days elapsed)`,
          alternativeAction: "offer_20_percent_store_credit",
        }
      }
      return { allowed: true }

    case "block_cod":
      // Check if pincode is in blocked list
      const blockedPincodes = shop.blockedPincodes || []
      if (blockedPincodes.includes(context?.pincode)) {
        return { allowed: true, reason: "Pincode is in blocked list" }
      }
      return { allowed: true }

    case "offer_discount":
      // Check discount policy
      const maxDiscount = shop.maxDiscount || 20
      if ((context?.discountPercent ?? 0) > maxDiscount) {
        return {
          allowed: false,
          reason: `Discount ${context?.discountPercent}% exceeds policy max ${maxDiscount}%`,
          alternativeAction: `offer_${maxDiscount}_percent_discount`,
        }
      }
      return { allowed: true }

    default:
      return { allowed: true }
  }
}
