import { db } from "@d2c/database"

export type OutcomeType =
  | "converted"   // cart recovered, order confirmed
  | "replied"     // customer replied to the message
  | "delivered"   // order delivered (for tracking comms)
  | "ignored"     // no action taken by customer after window
  | "blocked"     // customer blocked WA / unsubscribed
  | "failed"      // message delivery failed

/**
 * Close the feedback loop on a communication.
 * Called whenever we observe what happened after sending.
 */
export async function recordOutcome(
  outcomeRef: string,
  outcome: OutcomeType,
): Promise<void> {
  await db.communication.updateMany({
    where: { outcomeRef },
    data: { outcome, outcomeAt: new Date() },
  })
}

/**
 * Mark all un-closed comms for a customer as "ignored"
 * if they're older than the given window (ms) with no outcome.
 * Run periodically to clean up stale tracking.
 */
export async function markStaleAsIgnored(
  customerId: string,
  windowMs = 48 * 60 * 60 * 1000, // 48h default
): Promise<void> {
  const cutoff = new Date(Date.now() - windowMs)
  await db.communication.updateMany({
    where: {
      customerId,
      direction: "outbound",
      outcome: null,
      sentAt: { lt: cutoff },
    },
    data: { outcome: "ignored", outcomeAt: new Date() },
  })
}
