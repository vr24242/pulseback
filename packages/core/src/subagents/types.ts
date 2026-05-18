/**
 * Subagent Framework Types
 *
 * Subagents handle continuous, background workflows:
 * - Marketing Ops: Email sends, rank updates, referral tracking
 * - Intelligence: Weekly patterns, anomaly detection, forecasting
 * - System Optimization: Agent metrics, drift detection, reweighting
 * - Integration Sync: External systems, retries, health checks
 * - QA Audit: Decision validation, outcome tracking, quality checks
 */

export type SubagentType =
  | "marketing-ops"
  | "intelligence-analysis"
  | "system-optimization"
  | "integration-sync"
  | "qa-audit"

export type SubagentSchedule =
  | "realtime"                    // Process immediately
  | "hourly"                      // Every hour
  | "daily"                       // Daily at specific time
  | "weekly"                      // Weekly at specific day/time
  | "monthly"                     // Monthly at specific date/time
  | "on-demand"                   // Manual trigger only

export interface SubagentConfig {
  id: string
  type: SubagentType
  name: string
  description: string
  schedule: SubagentSchedule
  scheduledTime?: string          // "06:00" for daily, "Monday 10:00" for weekly
  maxConcurrency: number          // How many instances can run in parallel
  retryConfig: {
    maxRetries: number
    backoffMs: number
    backoffMultiplier: number
  }
  timeoutMs: number
  enabled: boolean
}

export interface SubagentContext {
  id: string
  type: SubagentType
  executionId: string
  startedAt: Date
  shopId?: string
  metadata?: Record<string, unknown>
}

export interface SubagentResult {
  executionId: string
  type: SubagentType
  status: "success" | "failure" | "partial"
  itemsProcessed: number
  itemsFailed: number
  executionTimeMs: number
  error?: string
  warnings: string[]
  metrics: {
    [key: string]: number | string
  }
  nextRunAt?: Date
}

export interface SubagentTask {
  id: string
  subagentType: SubagentType
  shopId?: string
  status: "pending" | "processing" | "completed" | "failed"
  data: Record<string, unknown>
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  error?: string
  retries: number
  maxRetries: number
}

/**
 * Subagent Interface
 * Each subagent implements this to define:
 * - What work it does
 * - How often to run it
 * - How to handle execution
 */
export interface ISubagent {
  config: SubagentConfig

  /**
   * Main execution function
   * Run the subagent's core logic
   */
  execute(ctx: SubagentContext): Promise<SubagentResult>

  /**
   * Health check
   * Verify subagent can connect to required services
   */
  healthCheck(): Promise<boolean>

  /**
   * Validate configuration
   * Ensure all required settings are present
   */
  validateConfig(): Promise<void>

  /**
   * Get next scheduled run time
   */
  getNextRun(): Date
}
