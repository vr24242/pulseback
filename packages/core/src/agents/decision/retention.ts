import Anthropic from "@anthropic-ai/sdk"
import type { CustomerMemory } from "../customer-memory"

const client = new Anthropic()

export interface RetentionDecision {
  action: "send" | "silence_90d"
  offerType: "discount" | "social_proof" | "new_arrivals" | "curiosity" | "appreciation"
  offerValue?: number  // ₹ or %
  reasoning: string
}

export async function decideRetention(
  memory: CustomerMemory,
  context: {
    lifecycleStage: string
    churnScore: number  // 0–100
    daysSinceLastOrder: number
    avgOrderValue: number
  },
): Promise<RetentionDecision> {
  // ── Fast rule-based decisions ────────────────────────────

  // Never spam: ignored 3+ comms in a row
  if (memory.hasIgnoredLast3Comms) {
    return {
      action: "silence_90d",
      offerType: "discount",
      reasoning: "Customer has ignored last 3 communications. Silence for 90 days.",
    }
  }

  // VIP: escalate to human
  if (memory.ltvTier === "vip") {
    return {
      action: "send",
      offerType: "appreciation",
      offerValue: 0,
      reasoning: "VIP customer. Personal outreach by human team.",
    }
  }

  // New customers: nurture with value
  if (context.lifecycleStage === "new" || context.lifecycleStage === "prospect") {
    return {
      action: "send",
      offerType: "social_proof",
      offerValue: 0,
      reasoning: "New customer. Building trust with social proof content.",
    }
  }

  // Active champions: appreciation (no discount)
  if (context.lifecycleStage === "champion") {
    return {
      action: "send",
      offerType: "appreciation",
      offerValue: 0,
      reasoning: "Active champion. Appreciation message, no discount needed.",
    }
  }

  // At-risk (high churn score, but still ordering): intervention with discount
  if (context.lifecycleStage === "at_risk" && context.churnScore >= 60) {
    const discountPercent = Math.min(15, Math.max(5, Math.ceil(context.churnScore / 10)))
    return {
      action: "send",
      offerType: "discount",
      offerValue: discountPercent,
      reasoning: `At-risk customer (churn ${context.churnScore}). Offering ${discountPercent}% discount to retain.`,
    }
  }

  // Lapsed (31–90 days): warm re-engagement with small offer
  if (context.daysSinceLastOrder >= 31 && context.daysSinceLastOrder <= 90) {
    return {
      action: "send",
      offerType: "curiosity",
      offerValue: 0,
      reasoning: `Lapsed ${context.daysSinceLastOrder} days. Curiosity angle: "Something new you might like".`,
    }
  }

  // Churned (91–180 days): bigger offer, different angle
  if (context.daysSinceLastOrder > 90 && context.daysSinceLastOrder <= 180) {
    const discountPercent = memory.avgOrderValue > 1000 ? 15 : 10
    return {
      action: "send",
      offerType: "discount",
      offerValue: discountPercent,
      reasoning: `Churned ${context.daysSinceLastOrder} days. Offering ${discountPercent}% to win back.`,
    }
  }

  // Churned 180+ days: silence for 90 days
  if (context.daysSinceLastOrder > 180) {
    return {
      action: "silence_90d",
      offerType: "discount",
      reasoning: `Churned 180+ days. Silent for 90 days, then try again.`,
    }
  }

  // New arrivals for mid-tier active
  if (context.lifecycleStage === "active" && memory.totalOrders >= 3 && memory.totalOrders <= 10) {
    return {
      action: "send",
      offerType: "new_arrivals",
      offerValue: 0,
      reasoning: "Active mid-tier. New arrivals angle to encourage repeat.",
    }
  }

  // Default: low-value, send new arrivals
  return {
    action: "send",
    offerType: "new_arrivals",
    offerValue: 0,
    reasoning: "Default retention: new arrivals content.",
  }
}
