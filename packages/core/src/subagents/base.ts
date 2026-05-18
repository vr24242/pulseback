import { SubagentConfig, SubagentContext, SubagentResult, ISubagent } from "./types"
import { v4 as uuid } from "uuid"

/**
 * Base Subagent Class
 * All subagents inherit from this to get:
 * - Execution lifecycle management
 * - Error handling & retry logic
 * - Metrics collection
 * - Scheduling
 */
export abstract class BaseSubagent implements ISubagent {
  config: SubagentConfig
  private lastRunAt?: Date
  private nextRunAt?: Date

  constructor(config: SubagentConfig) {
    this.config = config
    this.nextRunAt = this.calculateNextRun()
  }

  /**
   * Main execution wrapper
   * Handles retries, timing, error tracking
   */
  async executeWithRetry(
    ctx: SubagentContext,
    attempt: number = 0
  ): Promise<SubagentResult> {
    const startTime = Date.now()

    try {
      // Validate before execution
      await this.validateConfig()

      // Run the actual work
      const result = await this.execute(ctx)

      // Record success
      this.lastRunAt = new Date()
      this.nextRunAt = this.calculateNextRun()

      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
        nextRunAt: this.nextRunAt,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      // Retry logic
      if (attempt < this.config.retryConfig.maxRetries) {
        const backoffMs =
          this.config.retryConfig.backoffMs *
          Math.pow(this.config.retryConfig.backoffMultiplier, attempt)

        console.log(
          `[${this.config.type}] Retry ${attempt + 1}/${this.config.retryConfig.maxRetries} in ${backoffMs}ms`
        )

        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        return this.executeWithRetry(ctx, attempt + 1)
      }

      // All retries exhausted
      return {
        executionId: ctx.executionId,
        type: this.config.type,
        status: "failure",
        itemsProcessed: 0,
        itemsFailed: 0,
        executionTimeMs: Date.now() - startTime,
        error: errorMsg,
        warnings: [],
        metrics: {},
        nextRunAt: this.nextRunAt,
      }
    }
  }

  /**
   * Abstract method - override in subclass
   */
  abstract execute(ctx: SubagentContext): Promise<SubagentResult>

  /**
   * Health check - override if needed
   */
  async healthCheck(): Promise<boolean> {
    return true
  }

  /**
   * Validate config - override if needed
   */
  async validateConfig(): Promise<void> {
    if (!this.config.id) throw new Error("Subagent ID is required")
    if (!this.config.type) throw new Error("Subagent type is required")
    if (this.config.maxConcurrency < 1)
      throw new Error("Max concurrency must be >= 1")
  }

  /**
   * Calculate next run time based on schedule
   */
  private calculateNextRun(): Date {
    const now = new Date()

    switch (this.config.schedule) {
      case "realtime":
        return new Date(now.getTime() + 1000) // 1 second

      case "hourly":
        return new Date(now.getTime() + 60 * 60 * 1000)

      case "daily": {
        const [hour, minute] = (this.config.scheduledTime || "06:00").split(":").map(Number)
        const next = new Date(now)
        next.setHours(hour, minute, 0, 0)
        if (next <= now) next.setDate(next.getDate() + 1)
        return next
      }

      case "weekly": {
        // Parse "Monday 10:00" format
        const [day, time] = (this.config.scheduledTime || "Monday 10:00").split(" ")
        const [hour, minute] = time.split(":").map(Number)
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        const targetDay = daysOfWeek.indexOf(day)

        const next = new Date(now)
        next.setHours(hour, minute, 0, 0)

        // Find next occurrence of target day
        let daysToAdd = (targetDay - next.getDay() + 7) % 7
        if (daysToAdd === 0 && next <= now) daysToAdd = 7

        next.setDate(next.getDate() + daysToAdd)
        return next
      }

      case "monthly": {
        const [dateStr, timeStr] = (this.config.scheduledTime || "1 06:00").split(" ")
        const [hour, minute] = timeStr.split(":").map(Number)
        const targetDate = parseInt(dateStr)

        const next = new Date(now)
        next.setDate(targetDate)
        next.setHours(hour, minute, 0, 0)

        if (next <= now) {
          next.setMonth(next.getMonth() + 1)
        }
        return next
      }

      case "on-demand":
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // Far future

      default:
        return new Date(now.getTime() + 60 * 60 * 1000)
    }
  }

  getNextRun(): Date {
    return this.nextRunAt || this.calculateNextRun()
  }

  /**
   * Helper: Generate execution context
   */
  protected createContext(shopId?: string): SubagentContext {
    return {
      id: this.config.id,
      type: this.config.type,
      executionId: uuid(),
      startedAt: new Date(),
      shopId,
    }
  }

  /**
   * Helper: Create success result
   */
  protected successResult(
    ctx: SubagentContext,
    itemsProcessed: number,
    metrics: Record<string, number | string> = {}
  ): SubagentResult {
    return {
      executionId: ctx.executionId,
      type: this.config.type,
      status: "success",
      itemsProcessed,
      itemsFailed: 0,
      executionTimeMs: 0,
      warnings: [],
      metrics,
    }
  }

  /**
   * Helper: Create partial result (some items failed)
   */
  protected partialResult(
    ctx: SubagentContext,
    itemsProcessed: number,
    itemsFailed: number,
    warnings: string[] = [],
    metrics: Record<string, number | string> = {}
  ): SubagentResult {
    return {
      executionId: ctx.executionId,
      type: this.config.type,
      status: "partial",
      itemsProcessed,
      itemsFailed,
      executionTimeMs: 0,
      warnings,
      metrics,
    }
  }
}
