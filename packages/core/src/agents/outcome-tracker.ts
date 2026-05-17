import { db } from "@d2c/database"
import { v4 as uuidv4 } from "uuid"

export type OutcomeType =
  | "converted" // cart recovered, order confirmed
  | "replied" // customer replied to the message
  | "delivered" // order delivered (for tracking comms)
  | "ignored" // no action taken by customer after window
  | "blocked" // customer blocked WA / unsubscribed
  | "failed" // message delivery failed
  | "returned" // product returned

/**
 * Generate a new outcomeRef (UUID) for a Communication.
 * Called by Communication Agent before sending a message.
 * This UUID is stored on the Communication record for tracking outcomes.
 */
export function generateOutcomeRef(): string {
  return uuidv4()
}

/**
 * Close the feedback loop on a communication.
 * Called whenever we observe what happened after sending.
 *
 * @param outcomeRef UUID generated when message was sent
 * @param outcome Type of outcome observed
 * @param metadata Additional context (order ID, reply text, etc.)
 */
export async function recordOutcome(
  outcomeRef: string,
  outcome: OutcomeType,
  metadata?: Record<string, any>,
): Promise<void> {
  if (!outcomeRef) {
    console.warn("[OutcomeTracker] outcomeRef missing, skipping")
    return
  }

  try {
    await db.communication.update({
      where: { outcomeRef },
      data: {
        outcome,
        outcomeAt: new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })

    console.log(`[OutcomeTracker] outcome recorded: ${outcomeRef} → ${outcome}`)
  } catch (err) {
    if ((err as any).code === "P2025") {
      console.warn(`[OutcomeTracker] outcomeRef not found: ${outcomeRef}`)
      return
    }
    console.error("[OutcomeTracker] error recording outcome:", err)
    throw err
  }
}

/**
 * Mark all un-closed comms for a customer as "ignored"
 * if they're older than the given window (ms) with no outcome.
 * Run periodically to clean up stale tracking.
 */
export async function markStaleAsIgnored(
  customerId: string,
  windowMs = 48 * 60 * 60 * 1000, // 48h default
): Promise<number> {
  const cutoff = new Date(Date.now() - windowMs)
  const result = await db.communication.updateMany({
    where: {
      customerId,
      direction: "outbound",
      outcome: null,
      sentAt: { lt: cutoff },
    },
    data: { outcome: "ignored", outcomeAt: new Date() },
  })
  if (result.count > 0) {
    console.log(`[OutcomeTracker] marked ${result.count} comms as ignored for ${customerId}`)
  }
  return result.count
}

/**
 * Get outcome history for a customer.
 * Returns recent outcomes to see what worked and what didn't.
 */
export async function getCustomerOutcomeHistory(
  customerId: string,
  limit: number = 20,
): Promise<
  Array<{
    id: string
    triggerType: string
    outcome: string | null
    sentAt: Date
    outcomeAt: Date | null
    channel: string
    succeeded: boolean
  }>
> {
  const comms = await db.communication.findMany({
    where: { customerId, direction: "outbound" },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: {
      id: true,
      triggerType: true,
      outcome: true,
      sentAt: true,
      outcomeAt: true,
      channel: true,
    },
  })

  return comms.map(c => ({
    id: c.id,
    triggerType: c.triggerType,
    outcome: c.outcome,
    sentAt: c.sentAt,
    outcomeAt: c.outcomeAt,
    channel: c.channel,
    succeeded: c.outcome === "converted" || c.outcome === "replied",
  }))
}

/**
 * Calculate outcome rate for a communication type.
 * Used to measure effectiveness of different message strategies.
 */
export async function getOutcomeRate(
  shopId: string,
  triggerType: string,
  days: number = 30,
): Promise<{
  total: number
  succeeded: number
  rate: number
  outcomes: Record<OutcomeType, number>
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const comms = await db.communication.findMany({
    where: {
      shopId,
      triggerType,
      direction: "outbound",
      sentAt: { gte: since },
    },
    select: { outcome: true },
  })

  const total = comms.length
  const outcomeCounts: Record<OutcomeType | "null", number> = {
    converted: 0,
    replied: 0,
    delivered: 0,
    ignored: 0,
    blocked: 0,
    failed: 0,
    returned: 0,
    null: 0,
  }

  for (const c of comms) {
    const outcome = (c.outcome || "null") as keyof typeof outcomeCounts
    outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1
  }

  const succeeded = outcomeCounts.converted + outcomeCounts.replied
  const rate = total > 0 ? succeeded / total : 0

  return {
    total,
    succeeded,
    rate,
    outcomes: {
      converted: outcomeCounts.converted,
      replied: outcomeCounts.replied,
      delivered: outcomeCounts.delivered,
      ignored: outcomeCounts.ignored,
      blocked: outcomeCounts.blocked,
      failed: outcomeCounts.failed,
      returned: outcomeCounts.returned,
    },
  }
}

/**
 * Get communication funnel for a shop.
 * Shows: sent → delivered → replied → converted
 */
export async function getCommunicationFunnel(
  shopId: string,
  days: number = 30,
): Promise<{
  sent: number
  delivered: number
  replied: number
  converted: number
  conversionRate: number
  avgTimeToReply?: number
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [sent, outcomes] = await Promise.all([
    db.communication.count({
      where: { shopId, direction: "outbound", sentAt: { gte: since } },
    }),
    db.communication.findMany({
      where: { shopId, direction: "outbound", sentAt: { gte: since } },
      select: { outcome: true, sentAt: true, repliedAt: true },
    }),
  ])

  const delivered = outcomes.filter(o => o.outcome === "delivered").length
  const replied = outcomes.filter(o => o.repliedAt).length
  const converted = outcomes.filter(o => o.outcome === "converted").length

  const replyTimes = outcomes
    .filter(o => o.repliedAt && o.sentAt)
    .map(o => (o.repliedAt!.getTime() - o.sentAt.getTime()) / (60 * 60 * 1000)) // hours
  const avgTimeToReply =
    replyTimes.length > 0 ? replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length : undefined

  return {
    sent,
    delivered,
    replied,
    converted,
    conversionRate: sent > 0 ? converted / sent : 0,
    avgTimeToReply,
  }
}
