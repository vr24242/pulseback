import { Queue, Worker } from "bullmq"
import { createRedisConnection } from "../redis"
import {
  getOrchestrator,
  createMarketingOpsSubagents,
  createIntelligenceAnalysisSubagents,
  createSystemOptimizationSubagents,
  createIntegrationSyncSubagents,
  createQAAuditSubagents,
} from "@d2c/core/subagents"

/**
 * Subagents Orchestrator Worker
 *
 * Runs every 5 minutes to check if any subagents are due for execution.
 * If due, executes them and records metrics.
 *
 * This is the heartbeat that keeps all background workflows running.
 */

const SubagentsQueue = new Queue("subagents-orchestrator", {
  connection: createRedisConnection(),
})

export async function initSubagentsWorker() {
  const worker = new Worker(
    "subagents-orchestrator",
    async (job) => {
      console.log("[SubagentsOrchestrator] Checking for due subagents...")

      const orchestrator = getOrchestrator()

      // Register all known subagents (only once per worker lifecycle)
      const registeredCount = orchestrator.getRegisteredSubagents().length
      if (registeredCount === 0) {
        console.log("[SubagentsOrchestrator] Registering all subagent types...")
        orchestrator.register(createMarketingOpsSubagents())
        orchestrator.register(createIntelligenceAnalysisSubagents())
        orchestrator.register(createSystemOptimizationSubagents())
        orchestrator.register(createIntegrationSyncSubagents())
        orchestrator.register(createQAAuditSubagents())
        console.log(
          `[SubagentsOrchestrator] Registered ${orchestrator.getRegisteredSubagents().length} total subagent instances`
        )
      }

      // Execute all due subagents
      const results = await orchestrator.executeAllDueSubagents()

      // Log summary
      const metrics = orchestrator.getSummaryMetrics()
      console.log("[SubagentsOrchestrator] Execution complete:", metrics)

      return {
        executionsRun: results.length,
        metrics,
        upcomingRuns: orchestrator.getUpcomingRuns(5),
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 1, // Only one orchestrator running at a time
    }
  )

  worker.on("completed", (job) => {
    console.log(`[SubagentsOrchestrator] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[SubagentsOrchestrator] Job ${job?.id} failed:`, err)
  })

  return worker
}

/**
 * Enqueue the orchestrator job to run every 5 minutes
 * This should be called on app startup
 */
export async function scheduleSubagentsOrchestrator() {
  try {
    // Add a repeating job that runs every 5 minutes
    await SubagentsQueue.add(
      "orchestrator-tick",
      {},
      {
        repeat: {
          every: 5 * 60 * 1000, // 5 minutes in milliseconds
        },
        removeOnComplete: {
          age: 3600, // Remove completed jobs after 1 hour
        },
      }
    )

    console.log("[SubagentsOrchestrator] Scheduled to run every 5 minutes")
  } catch (error) {
    console.error("[SubagentsOrchestrator] Failed to schedule:", error)
    throw error
  }
}

export default SubagentsQueue
