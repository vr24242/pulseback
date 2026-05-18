import { BaseSubagent } from "./base"
import { SubagentContext, SubagentResult, SubagentConfig } from "./types"
import { db } from "@d2c/database"

/**
 * System Optimization Subagent
 *
 * Tracks agent decision metrics, detects performance drift, and optimizes weights.
 *
 * - Daily (9am IST): Calculate success rates for each agent/domain
 * - Weekly (Wednesday 10am): Detect performance degradation vs baseline
 * - Monthly (15th, 7am): Compute and recommend decision weight adjustments
 */
export class SystemOptimizationSubagent extends BaseSubagent {
  /**
   * Main execution - routes to specific workflow based on schedule
   */
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    try {
      switch (this.config.schedule) {
        case "daily":
          return await this.handleDailyMetrics(ctx)
        case "weekly":
          return await this.handleWeeklyDriftDetection(ctx)
        case "monthly":
          return await this.handleMonthlyReweighting(ctx)
        default:
          return this.successResult(ctx, 0)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error(`[${this.config.type}] Execution failed: ${errorMsg}`)
    }
  }

  /**
   * Daily workflow (9am IST):
   * Calculate success rates for each agent/domain
   */
  private async handleDailyMetrics(ctx: SubagentContext): Promise<SubagentResult> {
    const warnings: string[] = []
    let metricsCalculated = 0

    try {
      // Get all communications from last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const communications = await db.communication.findMany({
        where: { createdAt: { gte: oneDayAgo } },
        select: {
          triggerType: true,
          outcome: true,
          createdAt: true,
        },
      })

      if (communications.length === 0) {
        warnings.push("No communications in last 24 hours - insufficient data")
        return this.partialResult(ctx, 0, 0, warnings, { metricsCalculated: 0 })
      }

      // Group by trigger type (domain)
      const domainMetrics: Map<
        string,
        {
          total: number
          successful: number
          successRate: number
          healthStatus: string
        }
      > = new Map()

      for (const comm of communications) {
        const domain = comm.triggerType || "unknown"
        const isSuccess = comm.outcome === "converted" || comm.outcome === "replied"

        if (!domainMetrics.has(domain)) {
          domainMetrics.set(domain, {
            total: 0,
            successful: 0,
            successRate: 0,
            healthStatus: "healthy",
          })
        }

        const metric = domainMetrics.get(domain)!
        metric.total++
        if (isSuccess) metric.successful++
        metric.successRate = (metric.successful / metric.total) * 100

        // Classify health
        if (metric.successRate >= 80) {
          metric.healthStatus = "healthy"
        } else if (metric.successRate >= 60) {
          metric.healthStatus = "degrading"
        } else {
          metric.healthStatus = "critical"
        }
      }

      metricsCalculated = domainMetrics.size

      // Find top and worst performers
      const sorted = Array.from(domainMetrics.entries()).sort(
        (a, b) => b[1].successRate - a[1].successRate
      )

      const topPerformer = sorted[0]
      const worstPerformer = sorted[sorted.length - 1]

      const healthyCount = Array.from(domainMetrics.values()).filter(
        (m) => m.healthStatus === "healthy"
      ).length
      const degradingCount = Array.from(domainMetrics.values()).filter(
        (m) => m.healthStatus === "degrading"
      ).length
      const criticalCount = Array.from(domainMetrics.values()).filter(
        (m) => m.healthStatus === "critical"
      ).length

      const avgSuccessRate =
        Array.from(domainMetrics.values()).reduce((sum, m) => sum + m.successRate, 0) /
        domainMetrics.size

      const metrics: Record<string, string | number> = {
        metricsCalculated,
        domainsTracked: domainMetrics.size,
        domainsHealthy: healthyCount,
        domainsDegrading: degradingCount,
        domainsCritical: criticalCount,
        avgSystemSuccessRate: avgSuccessRate.toFixed(1) + "%",
      }

      if (topPerformer) {
        metrics.topPerformer = `${topPerformer[0]} (${topPerformer[1].successRate.toFixed(1)}%)`
      }

      if (worstPerformer) {
        metrics.worstPerformer = `${worstPerformer[0]} (${worstPerformer[1].successRate.toFixed(1)}%)`
      }

      return this.successResult(ctx, metricsCalculated, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Daily metrics failed: ${errorMsg}`)
      return this.partialResult(ctx, metricsCalculated, 0, warnings)
    }
  }

  /**
   * Weekly workflow (Wednesday 10am IST):
   * Detect performance degradation vs baseline
   */
  private async handleWeeklyDriftDetection(ctx: SubagentContext): Promise<SubagentResult> {
    const warnings: string[] = []
    let driftDetected = 0

    try {
      // Get this week's metrics (Monday-Sunday)
      const now = new Date()
      const dayOfWeek = now.getDay()
      const thisWeekStart = new Date(now)
      thisWeekStart.setDate(now.getDate() - dayOfWeek)
      thisWeekStart.setHours(0, 0, 0, 0)

      const lastWeekStart = new Date(thisWeekStart)
      lastWeekStart.setDate(lastWeekStart.getDate() - 7)

      // Get communications
      const thisWeekComms = await db.communication.findMany({
        where: { createdAt: { gte: thisWeekStart } },
        select: { triggerType: true, outcome: true },
      })

      const lastWeekComms = await db.communication.findMany({
        where: {
          createdAt: { gte: lastWeekStart, lt: thisWeekStart },
        },
        select: { triggerType: true, outcome: true },
      })

      if (thisWeekComms.length < 50 || lastWeekComms.length < 50) {
        warnings.push("Insufficient data this/last week for drift detection (< 50 comms)")
        return this.partialResult(ctx, 0, 0, warnings, { driftDetected: 0 })
      }

      // Compare success rates by domain
      const driftThreshold = 5 // Flag if change > 5%

      // Group this week
      const thisWeekByDomain: Map<string, { successful: number; total: number }> = new Map()
      for (const comm of thisWeekComms) {
        const domain = comm.triggerType || "unknown"
        const isSuccess = comm.outcome === "converted" || comm.outcome === "replied"

        if (!thisWeekByDomain.has(domain)) {
          thisWeekByDomain.set(domain, { successful: 0, total: 0 })
        }

        const m = thisWeekByDomain.get(domain)!
        m.total++
        if (isSuccess) m.successful++
      }

      // Group last week
      const lastWeekByDomain: Map<string, { successful: number; total: number }> = new Map()
      for (const comm of lastWeekComms) {
        const domain = comm.triggerType || "unknown"
        const isSuccess = comm.outcome === "converted" || comm.outcome === "replied"

        if (!lastWeekByDomain.has(domain)) {
          lastWeekByDomain.set(domain, { successful: 0, total: 0 })
        }

        const m = lastWeekByDomain.get(domain)!
        m.total++
        if (isSuccess) m.successful++
      }

      // Compare
      const driftingDomains: string[] = []

      for (const [domain, thisWeekMetric] of thisWeekByDomain.entries()) {
        const lastWeekMetric = lastWeekByDomain.get(domain)
        if (!lastWeekMetric) continue

        const thisWeekRate = (thisWeekMetric.successful / thisWeekMetric.total) * 100
        const lastWeekRate = (lastWeekMetric.successful / lastWeekMetric.total) * 100
        const change = thisWeekRate - lastWeekRate

        if (Math.abs(change) > driftThreshold) {
          driftDetected++
          driftingDomains.push(domain)
          warnings.push(
            `${domain}: ${change > 0 ? "+" : ""}${change.toFixed(1)}% change in success rate`
          )
        }
      }

      const metrics: Record<string, string | number> = {
        driftDetected: driftDetected > 0 ? "true" : "false",
        driftingDomainCount: driftDetected,
      }

      if (driftingDomains.length > 0) {
        metrics.driftingDomains = driftingDomains.join(", ")
      }

      return this.partialResult(ctx, 1, 0, warnings, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Drift detection failed: ${errorMsg}`)
      return this.partialResult(ctx, 0, 0, warnings)
    }
  }

  /**
   * Monthly workflow (15th, 7am IST):
   * Recommend decision weight adjustments based on outcomes
   */
  private async handleMonthlyReweighting(ctx: SubagentContext): Promise<SubagentResult> {
    const warnings: string[] = []
    let recommendationsGenerated = 0

    try {
      // Get last 30 days of communications
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const monthComms = await db.communication.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: {
          triggerType: true,
          outcome: true,
        },
      })

      if (monthComms.length < 100) {
        warnings.push("Insufficient data this month for reweighting (< 100 comms)")
        return this.partialResult(ctx, 0, 0, warnings, { recommendationsGenerated: 0 })
      }

      // Calculate success rates and generate adjustments
      const domainStats: Map<
        string,
        {
          successRate: number
          confidence: number
          recommended: number
        }
      > = new Map()

      const domainCounts: Map<string, { total: number; successful: number }> = new Map()

      for (const comm of monthComms) {
        const domain = comm.triggerType || "unknown"
        const isSuccess = comm.outcome === "converted" || comm.outcome === "replied"

        if (!domainCounts.has(domain)) {
          domainCounts.set(domain, { total: 0, successful: 0 })
        }

        const stat = domainCounts.get(domain)!
        stat.total++
        if (isSuccess) stat.successful++
      }

      // Compute recommendations
      for (const [domain, stat] of domainCounts.entries()) {
        const successRate = (stat.successful / stat.total) * 100
        const confidence = Math.min(100, (stat.total / 100) * 100) // Higher count = higher confidence

        // Current baseline weight assumption: 0.5
        // Adjust based on success rate
        let recommended = 0.5
        if (successRate >= 85) {
          recommended = 0.75 // Increase weight
          recommendationsGenerated++
        } else if (successRate >= 70) {
          recommended = 0.65 // Slight increase
          recommendationsGenerated++
        } else if (successRate < 60) {
          recommended = 0.35 // Decrease weight
          recommendationsGenerated++
        }

        domainStats.set(domain, {
          successRate,
          confidence,
          recommended,
        })
      }

      const metrics: Record<string, string | number> = {
        recommendationsGenerated,
        domainsAnalyzed: domainStats.size,
        avgSuccessRate:
          Array.from(domainStats.values())
            .reduce((sum, s) => sum + s.successRate, 0) / domainStats.size || 0,
      }

      // Add top recommendation
      const topDomain = Array.from(domainStats.entries()).sort(
        (a, b) => b[1].successRate - a[1].successRate
      )[0]

      if (topDomain) {
        metrics.topRecommendation = `Increase ${topDomain[0]} weight from 0.5 to ${topDomain[1].recommended.toFixed(2)}`
      }

      return this.successResult(ctx, recommendationsGenerated, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Reweighting failed: ${errorMsg}`)
      return this.partialResult(ctx, recommendationsGenerated, 0, warnings)
    }
  }

  /**
   * Health check - verify database is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await db.communication.count({ take: 1 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Validate system-optimization-specific config
   */
  async validateConfig(): Promise<void> {
    await super.validateConfig()

    if (!["daily", "weekly", "monthly"].includes(this.config.schedule)) {
      throw new Error(
        `Invalid schedule for SystemOptimizationSubagent: ${this.config.schedule}. Must be one of: daily, weekly, monthly`
      )
    }
  }
}

/**
 * Factory function to create all three instances of SystemOptimizationSubagent
 */
export function createSystemOptimizationSubagents(): SystemOptimizationSubagent[] {
  return [
    // Daily: Agent metrics at 9am IST
    new SystemOptimizationSubagent({
      id: "system-optimization-daily",
      type: "system-optimization",
      name: "System Optimization - Daily Metrics",
      description: "Calculate success rates for each agent/domain",
      schedule: "daily",
      scheduledTime: "09:00",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 2,
        backoffMs: 10000,
        backoffMultiplier: 2,
      },
      timeoutMs: 600000, // 10 minutes
      enabled: true,
    }),

    // Weekly: Drift detection Wednesday 10am IST
    new SystemOptimizationSubagent({
      id: "system-optimization-weekly",
      type: "system-optimization",
      name: "System Optimization - Weekly Drift Detection",
      description: "Detect performance degradation vs baseline",
      schedule: "weekly",
      scheduledTime: "Wednesday 10:00",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 1,
        backoffMs: 10000,
        backoffMultiplier: 2,
      },
      timeoutMs: 600000, // 10 minutes
      enabled: true,
    }),

    // Monthly: Reweighting 15th at 7am IST
    new SystemOptimizationSubagent({
      id: "system-optimization-monthly",
      type: "system-optimization",
      name: "System Optimization - Monthly Reweighting",
      description: "Recommend decision weight adjustments based on outcomes",
      schedule: "monthly",
      scheduledTime: "15 07:00",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 1,
        backoffMs: 10000,
        backoffMultiplier: 2,
      },
      timeoutMs: 600000, // 10 minutes
      enabled: true,
    }),
  ]
}
