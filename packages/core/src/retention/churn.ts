import { db } from "@d2c/database"
import { scoreChurn, determineLtvTier } from "../identity/scorer"
import { publishEvent } from "../events/bus"

// Run daily via cron — updates churn scores and schedules retention actions
export async function runRetentionSweep(shopId: string): Promise<void> {
  const customers = await db.customer.findMany({
    where: {
      shopId,
      totalOrders: { gt: 0 },
      lifecycleStage: { notIn: ["lapsed"] },
    },
    select: {
      id: true,
      totalOrders: true,
      totalReturns: true,
      returnRate: true,
      lastOrderAt: true,
      expectedNextOrderAt: true,
      emailOpenRate: true,
      whatsappResponseRate: true,
      churnScore: true,
      ltvTier: true,
      ltv: true,
      lifecycleStage: true,
      nextActionAt: true,
    },
  })

  await Promise.allSettled(customers.map((c) => evaluateCustomer(shopId, c)))
}

async function evaluateCustomer(
  shopId: string,
  customer: {
    id: string
    totalOrders: number
    totalReturns: number
    returnRate: number
    lastOrderAt: Date | null
    expectedNextOrderAt: Date | null
    emailOpenRate: number
    whatsappResponseRate: number
    churnScore: number
    ltvTier: string
    ltv: number
    lifecycleStage: string
    nextActionAt: Date | null
  }
): Promise<void> {
  if (!customer.lastOrderAt) return

  const daysSinceLastOrder = (Date.now() - customer.lastOrderAt.getTime()) / 86400000

  // Avg order frequency from their history
  const avgFrequencyDays =
    customer.totalOrders > 1
      ? daysSinceLastOrder / (customer.totalOrders - 1)
      : 30

  const recentTickets = await db.supportTicket.count({
    where: {
      customerId: customer.id,
      openedAt: { gte: new Date(Date.now() - 30 * 86400000) },
    },
  })

  const churnScore = scoreChurn({
    daysSinceLastOrder,
    avgOrderFrequencyDays: avgFrequencyDays,
    emailOpenRate: customer.emailOpenRate,
    whatsappResponseRate: customer.whatsappResponseRate,
    recentSupportTickets: recentTickets,
    returnRate: customer.returnRate,
  })

  // Determine new lifecycle stage
  let lifecycleStage = customer.lifecycleStage
  if (churnScore >= 86) lifecycleStage = "lapsed"
  else if (churnScore >= 51) lifecycleStage = "at_risk"

  // Decide next retention action
  const nextAction = resolveNextAction(churnScore, customer.ltvTier)

  await db.customer.update({
    where: { id: customer.id },
    data: {
      churnScore,
      lifecycleStage,
      nextActionType: nextAction?.type,
      nextActionAt: nextAction?.scheduledFor,
    },
  })

  // Fire event if churn risk crossed a threshold
  if (churnScore >= 51 && customer.churnScore < 51) {
    await publishEvent({
      eventType: "retention.churn_risk_detected",
      shopId,
      customerId: customer.id,
      timestamp: new Date(),
      metadata: {
        churnScore,
        daysSinceLastOrder,
        ltvTier: customer.ltvTier,
        suggestedAction:
          churnScore >= 71
            ? "win_back_offer"
            : churnScore >= 51
            ? "personal_outreach"
            : "soft_engagement",
      },
    })
  }

  // Schedule the action in retention_actions table
  if (nextAction && (!customer.nextActionAt || customer.nextActionAt < new Date())) {
    await db.retentionAction.create({
      data: {
        shopId,
        customerId: customer.id,
        actionType: nextAction.type,
        scheduledFor: nextAction.scheduledFor,
        status: "scheduled",
      },
    })
  }
}

function resolveNextAction(
  churnScore: number,
  ltvTier: string
): { type: string; scheduledFor: Date } | null {
  const tomorrow = new Date(Date.now() + 86400000)
  const in3Days = new Date(Date.now() + 3 * 86400000)
  const in7Days = new Date(Date.now() + 7 * 86400000)

  if (churnScore >= 86) return { type: "win_back", scheduledFor: tomorrow }
  if (churnScore >= 71) return { type: "win_back", scheduledFor: in3Days }
  if (churnScore >= 51) return { type: "churn_intervention", scheduledFor: tomorrow }
  if (churnScore >= 31 && ltvTier === "vip") return { type: "vip_reward", scheduledFor: in7Days }
  return null
}
