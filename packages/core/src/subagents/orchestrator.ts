import { ISubagent, SubagentContext, SubagentResult } from "./types"
import { v4 as uuid } from "uuid"

/**
 * SubagentOrchestrator
 *
 * Manages the execution lifecycle of all subagents.
 * - Registers subagent instances
 * - Tracks next run times
 * - Executes subagents when scheduled
 * - Collects execution metrics
 * - Handles retries and error tracking
 *
 * Usage:
 *   const orchestrator = new SubagentOrchestrator()
 *   orchestrator.register(marketingOpsSubagents)
 *   const nextDue = orchestrator.getNextDueSubagents()
 *   for (const subagent of nextDue) {
 *     await orchestrator.executeSubagent(subagent)
 *   }
 */
export class SubagentOrchestrator {
  private subagents: Map<string, ISubagent> = new Map()
  private executionHistory: Array<{
    subagentId: string
    executedAt: Date
    result: SubagentResult
  }> = []

  /**
   * Register a single subagent or array of subagents
   */
  register(subagent: ISubagent | ISubagent[]): void {
    const subagentsToRegister = Array.isArray(subagent) ? subagent : [subagent]

    for (const sa of subagentsToRegister) {
      this.subagents.set(sa.config.id, sa)
      console.log(`[SubagentOrchestrator] Registered subagent: ${sa.config.id}`)
    }
  }

  /**
   * Get all subagents currently registered
   */
  getRegisteredSubagents(): ISubagent[] {
    return Array.from(this.subagents.values())
  }

  /**
   * Get subagents that are due to run now
   */
  getNextDueSubagents(): ISubagent[] {
    const now = new Date()
    const dueSubagents: ISubagent[] = []

    for (const subagent of this.subagents.values()) {
      if (!subagent.config.enabled) continue

      const nextRun = subagent.getNextRun()
      if (nextRun <= now) {
        dueSubagents.push(subagent)
      }
    }

    return dueSubagents
  }

  /**
   * Get all upcoming subagent runs
   */
  getUpcomingRuns(limit: number = 10): Array<{
    subagentId: string
    name: string
    nextRunAt: Date
    schedule: string
  }> {
    const upcoming = Array.from(this.subagents.values())
      .filter((sa) => sa.config.enabled)
      .map((sa) => ({
        subagentId: sa.config.id,
        name: sa.config.name,
        nextRunAt: sa.getNextRun(),
        schedule: sa.config.schedule,
      }))
      .sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime())
      .slice(0, limit)

    return upcoming
  }

  /**
   * Execute a single subagent with retry logic
   */
  async executeSubagent(subagent: ISubagent): Promise<SubagentResult> {
    console.log(
      `[SubagentOrchestrator] Executing subagent: ${subagent.config.id} (${subagent.config.name})`
    )

    // Create execution context
    const context: SubagentContext = {
      id: subagent.config.id,
      type: subagent.config.type,
      executionId: uuid(),
      startedAt: new Date(),
    }

    try {
      // Validate config
      await subagent.validateConfig()

      // Health check
      const isHealthy = await subagent.healthCheck()
      if (!isHealthy) {
        console.warn(`[SubagentOrchestrator] Health check failed for ${subagent.config.id}`)
      }

      // Execute with retry logic
      const result = await subagent.executeWithRetry(context)

      // Record in history
      this.executionHistory.push({
        subagentId: subagent.config.id,
        executedAt: new Date(),
        result,
      })

      console.log(
        `[SubagentOrchestrator] Subagent ${subagent.config.id} completed: ${result.status}`,
        {
          itemsProcessed: result.itemsProcessed,
          itemsFailed: result.itemsFailed,
          executionTimeMs: result.executionTimeMs,
        }
      )

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[SubagentOrchestrator] Subagent ${subagent.config.id} failed: ${errorMsg}`)

      const failureResult: SubagentResult = {
        executionId: context.executionId,
        type: subagent.config.type,
        status: "failure",
        itemsProcessed: 0,
        itemsFailed: 0,
        executionTimeMs: Date.now() - context.startedAt.getTime(),
        error: errorMsg,
        warnings: [],
        metrics: {},
      }

      this.executionHistory.push({
        subagentId: subagent.config.id,
        executedAt: new Date(),
        result: failureResult,
      })

      throw error
    }
  }

  /**
   * Execute all due subagents
   */
  async executeAllDueSubagents(): Promise<SubagentResult[]> {
    const dueSubagents = this.getNextDueSubagents()

    if (dueSubagents.length === 0) {
      console.log("[SubagentOrchestrator] No subagents due for execution")
      return []
    }

    console.log(
      `[SubagentOrchestrator] Found ${dueSubagents.length} subagent(s) due for execution`
    )

    const results: SubagentResult[] = []

    // Execute sequentially (one at a time to avoid overload)
    for (const subagent of dueSubagents) {
      try {
        const result = await this.executeSubagent(subagent)
        results.push(result)
      } catch (error) {
        console.error(
          `[SubagentOrchestrator] Failed to execute ${subagent.config.id}: ${error instanceof Error ? error.message : String(error)}`
        )
        // Continue with other subagents even if one fails
      }
    }

    return results
  }

  /**
   * Get execution history for a specific subagent
   */
  getExecutionHistory(subagentId: string, limit: number = 10) {
    return this.executionHistory
      .filter((entry) => entry.subagentId === subagentId)
      .slice(-limit)
      .reverse()
  }

  /**
   * Get summary metrics of all subagent executions
   */
  getSummaryMetrics() {
    const totalExecutions = this.executionHistory.length
    const successfulExecutions = this.executionHistory.filter((e) => e.result.status === "success")
      .length
    const failedExecutions = this.executionHistory.filter((e) => e.result.status === "failure")
      .length

    const totalItemsProcessed = this.executionHistory.reduce(
      (sum, e) => sum + e.result.itemsProcessed,
      0
    )
    const totalItemsFailed = this.executionHistory.reduce(
      (sum, e) => sum + e.result.itemsFailed,
      0
    )

    const avgExecutionTimeMs =
      totalExecutions > 0
        ? this.executionHistory.reduce((sum, e) => sum + e.result.executionTimeMs, 0) /
          totalExecutions
        : 0

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate:
        totalExecutions > 0 ? ((successfulExecutions / totalExecutions) * 100).toFixed(2) + "%" : "N/A",
      totalItemsProcessed,
      totalItemsFailed,
      avgExecutionTimeMs: avgExecutionTimeMs.toFixed(0),
    }
  }
}

/**
 * Global singleton orchestrator instance
 */
let globalOrchestrator: SubagentOrchestrator | null = null

/**
 * Get or create the global orchestrator
 */
export function getOrchestrator(): SubagentOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new SubagentOrchestrator()
  }
  return globalOrchestrator
}

/**
 * Set the global orchestrator (useful for testing)
 */
export function setOrchestrator(orchestrator: SubagentOrchestrator): void {
  globalOrchestrator = orchestrator
}
