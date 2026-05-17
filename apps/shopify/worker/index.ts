/**
 * PulseOS Worker Process
 *
 * Runs as a separate Fly.io process alongside the Remix server.
 * Starts all BullMQ workers and registers repeatable scheduled jobs.
 *
 * fly.toml:
 *   [processes]
 *     app    = "node build/server/index.js"
 *     worker = "node build/worker/index.js"
 */

import { startWebhookWorker }       from "@d2c/core/queue/webhook.worker"
import { startCommunicationWorker } from "@d2c/core/queue/communication.worker"
import { startTrackingWorker }      from "@d2c/core/queue/tracking.worker"
import { startNdrWorker }           from "@d2c/core/queue/ndr.worker"
import { startAbandonedWorker }     from "@d2c/core/queue/abandoned.worker"
import { startRetentionWorker }     from "@d2c/core/queue/retention.worker"
import { startWinbackWorker }       from "@d2c/core/queue/winback.worker"
import { startBriefingWorker }      from "@d2c/core/queue/briefing.worker"
import { registerRepeatableJobs }   from "@d2c/core/queue/scheduler"

async function main() {
  console.log("🚀 PulseOS Worker starting...")

  if (!process.env.REDIS_URL) {
    console.error("❌ REDIS_URL is not set. Worker cannot start.")
    process.exit(1)
  }

  // Start all workers
  const workers = [
    startWebhookWorker(),       // Shopify webhooks        — concurrency 10, priority queue
    startCommunicationWorker(), // WhatsApp/SMS sends      — concurrency 30
    startTrackingWorker(),      // Shiprocket polling      — concurrency 5, every 15min
    startNdrWorker(),           // Stuck shipment recovery — concurrency 3, every 1hr
    startAbandonedWorker(),     // Cart recovery           — concurrency 5, every 5min
    startRetentionWorker(),     // Customer RFM scoring    — concurrency 2, daily 10am IST
    startWinbackWorker(),       // Lapsed re-engagement    — concurrency 2, daily 11am IST
    startBriefingWorker(),      // 9pm merchant briefing   — concurrency 3, daily 9pm IST
  ]

  // Register repeatable schedules (replaces cron-job.org)
  await registerRepeatableJobs()

  console.log(`✅ ${workers.length} workers running. Schedules registered.\n`)
  console.log("   webhook       → concurrency 10  · event-driven")
  console.log("   communication → concurrency 30  · event-driven")
  console.log("   tracking      → concurrency 5   · every 15 min")
  console.log("   ndr           → concurrency 3   · every 1 hr")
  console.log("   abandoned     → concurrency 5   · every 5 min")
  console.log("   retention     → concurrency 2   · daily 10am IST")
  console.log("   winback       → concurrency 2   · daily 11am IST")
  console.log("   briefing      → concurrency 3   · daily 9pm IST")

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("\n[worker] SIGTERM received, shutting down gracefully...")
    await Promise.all(workers.map(w => w.close()))
    console.log("[worker] All workers closed.")
    process.exit(0)
  })
}

main().catch(err => {
  console.error("❌ Worker failed to start:", err)
  process.exit(1)
})
