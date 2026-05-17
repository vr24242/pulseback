import Anthropic from "@anthropic-ai/sdk"
import type { CustomerMemory } from "../customer-memory"

const client = new Anthropic()

export interface NDRDecision {
  action: "send_wa" | "request_address_update" | "initiate_rto" | "escalate_merchant"
  messageIntent: "confirm_availability" | "address_correction" | "final_notice"
  reasoning: string
}

export async function decideNDR(
  memory: CustomerMemory,
  shipment: {
    orderId: string
    awbNumber: string
    failedAttempts: number
    lastAttemptAt: Date
    daysInTransit: number
    isStuck: boolean
    lastTrackingEvent?: string
    pincodeRTORate?: number  // From Shiprocket intelligence
    bestCourierInPincode?: string  // From Shiprocket intelligence
  },
): Promise<NDRDecision> {
  // ── Fast rule-based decisions ────────────────────────────

  // Never spam: ignored 3+ comms in a row
  if (memory.hasIgnoredLast3Comms) {
    return {
      action: "escalate_merchant",
      messageIntent: "final_notice",
      reasoning: "Customer has ignored last 3 communications. Merchant should decide next steps.",
    }
  }

  // Quiet hours: 22:00–08:00 IST
  const istHour = (new Date().getUTCHours() + 5) % 24
  if (istHour >= 22 || istHour < 8) {
    return {
      action: "send_wa",
      messageIntent: "confirm_availability",
      reasoning: "NDR is time-sensitive. Will queue for morning send.",
    }
  }

  // First attempt: always try to confirm
  if (shipment.failedAttempts === 1) {
    return {
      action: "send_wa",
      messageIntent: "confirm_availability",
      reasoning: "First NDR attempt. Confirming if customer is available.",
    }
  }

  // Second attempt: request address update
  if (shipment.failedAttempts === 2) {
    return {
      action: "request_address_update",
      messageIntent: "address_correction",
      reasoning: "After 2 failed attempts, address might be incorrect. Requesting update.",
    }
  }

  // VIP customer: always try to resolve before RTO
  if (memory.ltvTier === "vip") {
    if (shipment.failedAttempts <= 3) {
      return {
        action: "send_wa",
        messageIntent: "confirm_availability",
        reasoning: "VIP customer. Making extra effort before RTO.",
      }
    }
  }

  // Stuck for 3+ days: initiate RTO
  if (shipment.daysInTransit >= 3 && shipment.isStuck) {
    return {
      action: "initiate_rto",
      messageIntent: "final_notice",
      reasoning: `Shipment stuck for ${shipment.daysInTransit} days. Initiating RTO.`,
    }
  }

  // After 3 attempts: escalate to merchant
  if (shipment.failedAttempts >= 3) {
    return {
      action: "escalate_merchant",
      messageIntent: "final_notice",
      reasoning: `3+ failed attempts after ${shipment.daysInTransit} days. Needs merchant review.`,
    }
  }

  // Default: try again
  return {
    action: "send_wa",
    messageIntent: "confirm_availability",
    reasoning: `Attempt ${shipment.failedAttempts}. Confirming delivery availability.`,
  }
}
