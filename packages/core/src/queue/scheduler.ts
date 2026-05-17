/**
 * Registers all repeatable jobs in BullMQ.
 * Call once at worker startup — BullMQ deduplicates by key.
 * Replaces cron-job.org entirely.
 */
import {
  getTrackingQueue,
  getAbandonedQueue,
  getNdrQueue,
  getRetentionQueue,
  getWinbackQueue,
} from "./queues"

export async function registerRepeatableJobs() {
  console.log("[scheduler] Registering repeatable jobs...")

  // Shipment tracking — every 15 minutes
  await getTrackingQueue().add(
    "sweep",
    {},
    {
      repeat: { pattern: "*/15 * * * *" },
      jobId: "tracking:sweep:repeatable",
    }
  )

  // Abandoned cart recovery — every 5 minutes
  await getAbandonedQueue().add(
    "sweep",
    {},
    {
      repeat: { pattern: "*/5 * * * *" },
      jobId: "abandoned:sweep:repeatable",
    }
  )

  // NDR sweep — every hour
  await getNdrQueue().add(
    "sweep",
    {},
    {
      repeat: { pattern: "0 * * * *" },
      jobId: "ndr:sweep:repeatable",
    }
  )

  // Retention scoring — daily at 10am IST (4:30 UTC)
  await getRetentionQueue().add(
    "daily",
    {},
    {
      repeat: { pattern: "30 4 * * *" },
      jobId: "retention:daily:repeatable",
    }
  )

  // Win-back — daily at 11am IST (5:30 UTC)
  await getWinbackQueue().add(
    "daily",
    {},
    {
      repeat: { pattern: "30 5 * * *" },
      jobId: "winback:daily:repeatable",
    }
  )

  // Briefing — daily at 9pm IST (15:30 UTC)
  // Briefing worker handles per-shop scheduling internally
  // so we just trigger the sweep once
  const { getBriefingQueue } = await import("./queues.js")
  await getBriefingQueue().add(
    "daily",
    { shopId: "all" } as never,
    {
      repeat: { pattern: "30 15 * * *" },
      jobId: "briefing:daily:repeatable",
    }
  )

  console.log("[scheduler] All repeatable jobs registered ✓")
}
