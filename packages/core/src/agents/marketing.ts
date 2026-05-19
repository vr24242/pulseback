import { db } from "@d2c/database"
import { CalendarAgent } from "./calendar"
import type { CustomerMemory } from "./customer-memory"
import { generateMessage } from "./communication"
import { generateOutcomeRef } from "./outcome-tracker"
import { getRedis } from "../queue/redis"

/**
 * Marketing Agent
 *
 * Replaces: manual segmentation, template blasts, guessed timing
 *
 * Capabilities:
 * 1. Autonomous Campaigns — decides what to send to whom when without merchant init
 * 2. Per-Customer Messages — Communication Agent writes unique message per customer
 * 3. Offer Computation — optimal discount per customer segment
 * 4. Frequency Intelligence — knows each customer's tolerance
 * 5. Attribution — every campaign comm has outcomeRef, conversion closed when order placed
 * 6. Calendar Coordination — no duplicate comms same day, priority system
 * 7. A/B Testing (future) — 10% try different framing, tracks what converts per segment
 */

export type CampaignType =
  | "abandoned_cart" // multi-touch recovery
  | "winback" // reactivation campaigns
  | "cross_sell" // product recommendations
  | "retention" // loyalty/appreciation
  | "broadcast" // merchant-initiated
  | "seasonal" // holidays, sales events

export interface CampaignConfig {
  type: CampaignType
  name: string
  description: string
  targetSegments: Array<"all" | "new" | "active" | "at_risk" | "vip" | "churned">
  offerType?: "discount" | "social_proof" | "new_arrivals" | "curiosity" | "appreciation" | "free_shipping"
  offerValue?: number // % or ₹
  maxBudget?: number // total comms to send
  startAt?: Date
  endAt?: Date
  rules?: {
    minLTV?: number
    maxLTV?: number
    excludeRTOCount?: number
    requirePreviousPurchase?: boolean
  }
}

export interface CampaignDecision {
  send: boolean
  campaignType: CampaignType
  offerType?: string
  offerValue?: number
  reasoning: string
  costPerCustomer?: number // cost of offer if applicable
  expectedConversionRate?: number
}

export interface CampaignPerformance {
  campaignType: CampaignType
  segmentName: string
  sent: number
  delivered: number
  replied: number
  converted: number
  conversionRate: number
  roas?: number // revenue attributable / cost of offers
}

/**
 * Decide whether to send a campaign message to a specific customer.
 * Uses CustomerMemory to personalize.
 */
export async function decideCampaignAction(
  customerId: string,
  campaign: CampaignConfig,
  memory: CustomerMemory,
): Promise<CampaignDecision> {
  // Check if customer matches target segments
  const inSegment = campaign.targetSegments.includes("all") ||
    campaign.targetSegments.includes(memory.lifecycleStage) ||
    campaign.targetSegments.some(seg => {
      if (seg === "vip") return memory.ltvTier === "vip"
      if (seg === "new") return memory.totalOrders === 0
      if (seg === "active") return memory.totalOrders >= 1 && memory.churnScore < 50
      if (seg === "at_risk") return memory.churnScore > 50 && memory.churnScore < 80
      if (seg === "churned") return memory.churnScore >= 80
      return false
    })

  if (!inSegment) {
    return {
      send: false,
      campaignType: campaign.type,
      reasoning: "Customer not in target segment",
    }
  }

  // Check rules
  if (campaign.rules) {
    const ltv = memory.avgOrderValue * memory.totalOrders
    if (campaign.rules.minLTV && ltv < campaign.rules.minLTV) {
      return { send: false, campaignType: campaign.type, reasoning: "LTV below minimum" }
    }
    if (campaign.rules.maxLTV && ltv > campaign.rules.maxLTV) {
      return { send: false, campaignType: campaign.type, reasoning: "LTV above threshold" }
    }
    if (campaign.rules.excludeRTOCount && memory.rtoCount >= campaign.rules.excludeRTOCount) {
      return { send: false, campaignType: campaign.type, reasoning: "High RTO count" }
    }
    if (campaign.rules.requirePreviousPurchase && memory.totalOrders === 0) {
      return { send: false, campaignType: campaign.type, reasoning: "No purchase history" }
    }
  }

  // Compute optimal offer
  const offer = computeOptimalOffer(memory, campaign)

  // Key rule: hasIgnoredLast3Comms → silence
  if (memory.hasIgnoredLast3Comms) {
    return {
      send: false,
      campaignType: campaign.type,
      reasoning: "Customer has ignored last 3 comms — silence",
    }
  }

  // Key rule: pending issues → hold marketing
  if (memory.hasOpenNDR || memory.hasPendingRefund || memory.hasPendingReturn) {
    return {
      send: false,
      campaignType: campaign.type,
      reasoning: "Customer has pending issue — hold marketing",
    }
  }

  return {
    send: true,
    campaignType: campaign.type,
    offerType: offer.type,
    offerValue: offer.value,
    reasoning: `Send to ${memory.ltvTier} customer, ${offer.reasoning}`,
    expectedConversionRate: estimateConversion(memory, campaign),
  }
}

/**
 * Compute optimal offer value per customer.
 * VIP → no discount. Mid-tier → 10%. Low-value → silence (LTV < discount cost).
 */
function computeOptimalOffer(
  memory: CustomerMemory,
  campaign: CampaignConfig,
): { type: string; value: number; reasoning: string } {
  const ltv = memory.avgOrderValue * memory.totalOrders

  // VIP: never discount, offer exclusive/appreciation
  if (memory.ltvTier === "vip") {
    return {
      type: "appreciation",
      value: 0,
      reasoning: "VIP customer — exclusive access, no discount needed",
    }
  }

  // High-tier: small discount or free shipping
  if (memory.ltvTier === "high" || memory.ltvTier === "mid") {
    return {
      type: "discount",
      value: 10,
      reasoning: "Loyal customer — 10% to re-engage",
    }
  }

  // Low-tier at-risk: larger discount
  if (memory.ltvTier === "low" && memory.lifecycleStage === "at_risk") {
    return {
      type: "discount",
      value: 20,
      reasoning: "At-risk, low LTV — 20% to recover",
    }
  }

  // Default: match campaign's offer if set
  if (campaign.offerValue) {
    return {
      type: campaign.offerType || "discount",
      value: campaign.offerValue,
      reasoning: `Campaign offer: ${campaign.offerValue}%`,
    }
  }

  return {
    type: "curiosity",
    value: 0,
    reasoning: "No discount, lead with new content",
  }
}

/**
 * Estimate conversion rate for this customer + campaign combination.
 */
function estimateConversion(memory: CustomerMemory, campaign: CampaignConfig): number {
  let baseRate = 0.05 // 5% baseline

  // Adjust by customer segment
  if (memory.lifecycleStage === "champion") baseRate = 0.15
  else if (memory.lifecycleStage === "active") baseRate = 0.08
  else if (memory.lifecycleStage === "at_risk") baseRate = 0.06
  else if (memory.lifecycleStage === "churned") baseRate = 0.02

  // Adjust by campaign type
  if (campaign.type === "abandoned_cart") baseRate *= 2 // carts have high intent
  if (campaign.type === "winback") baseRate *= 0.8 // harder to reactivate

  // Adjust by communication history
  if (memory.recentComms.length > 0) {
    const lastConverted = memory.recentComms[0].converted
    baseRate *= lastConverted ? 1.2 : 0.9
  }

  return Math.min(1, baseRate)
}

/**
 * Get campaign performance metrics.
 * Used for optimization and reporting.
 */
export async function getCampaignPerformance(
  shopId: string,
  campaignType: CampaignType,
  days: number = 30,
): Promise<CampaignPerformance[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const comms = await db.communication.findMany({
    where: {
      shopId,
      direction: "outbound",
      sentAt: { gte: since },
      triggerType: campaignType,
    },
    select: { outcome: true, repliedAt: true },
  })

  const total = comms.length
  const delivered = comms.filter(c => c.outcome === "delivered").length
  const replied = comms.filter(c => c.repliedAt).length
  const converted = comms.filter(c => c.outcome === "converted").length

  return [
    {
      campaignType,
      segmentName: "all",
      sent: total,
      delivered,
      replied,
      converted,
      conversionRate: total > 0 ? converted / total : 0,
    },
  ]
}

/**
 * Recommend best time to send campaign (by hour, considering timezone + customer preference).
 * Returns IST hour (0-23) with highest expected open rate.
 */
export async function recommendSendTime(
  memory: CustomerMemory,
): Promise<{ hour: number; reason: string }> {
  // Use customer's preferred reply hour as proxy for active time
  if (memory.preferredReplyHour) {
    return {
      hour: memory.preferredReplyHour,
      reason: "Customer typically replies around this time",
    }
  }

  // Default: 10am IST for most segments
  if (memory.lifecycleStage === "churned") {
    return { hour: 14, reason: "Evening for disengaged customers (post-work)" }
  }

  return {
    hour: 10,
    reason: "Morning is standard high-engagement time in India",
  }
}

/**
 * Handle campaign attribution when order is placed.
 * Close the feedback loop: which campaign drove this order?
 */
export async function attributeOrderToCampaign(orderId: string): Promise<void> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { checkoutSession: true },
  })

  // Find recent comms with outcome="converted" that match timing
  const recentComms = await db.communication.findMany({
    where: {
      customerId: order.customerId,
      direction: "outbound",
      outcome: "converted",
      sentAt: {
        gte: new Date(order.createdAt.getTime() - 7 * 24 * 60 * 60 * 1000),
        lte: order.createdAt,
      },
    },
    orderBy: { sentAt: "desc" },
    take: 1,
  })

  if (recentComms.length > 0) {
    const comm = recentComms[0]
    // Update order to reference the campaign
    await db.order.update({
      where: { id: orderId },
      data: {
        sourceComm: comm.id,
      },
    })
    console.log(`[MarketingAgent] attributed order ${orderId} to campaign ${comm.triggerType}`)
  }
}
