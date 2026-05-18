import { BaseSubagent } from "./base"
import { SubagentContext, SubagentResult, SubagentConfig } from "./types"
import { db } from "@d2c/database"

/**
 * QA Audit Subagent
 *
 * Validates decision quality, tracks outcomes, and audits communication effectiveness.
 *
 * - Daily (11pm IST): Audit daily communication quality and outcomes
 * - Weekly (Sunday 11pm): Full decision validation and reasoning audit
 * - Monthly (30th, 11pm): Communication quality report and recommendations
 */
export class QAAuditSubagent extends BaseSubagent {
  /**
   * Main execution - routes to specific workflow based on schedule
   */
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    try {
      switch (this.config.schedule) {
        case "daily":
          return await this.handleDailyCommunicationAudit(ctx)
        case "weekly":
          return await this.handleWeeklyDecisionValidation(ctx)
        case "monthly":
          return await this.handleMonthlyQualityReport(ctx)
        default:
          return this.successResult(ctx, 0)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error(`[${this.config.type}] Execution failed: ${errorMsg}`)
    }
  }

  /**
   * Daily workflow (11pm IST):
   * Audit communication quality and track outcomes
   */
  private async handleDailyCommunicationAudit(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    let itemsFailed = 0
    const warnings: string[] = []

    try {
      // Get all communications from today
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const todayComms = await db.communication.findMany({
        where: {
          createdAt: { gte: today },
        },
      })

      itemsProcessed = todayComms.length

      // Audit quality metrics
      let qualityIssues = 0

      // Check 1: Communications should have outcomeRef
      const missingOutcomeRef = todayComms.filter((c: typeof todayComms[number]) => !c.outcomeRef).length
      if (missingOutcomeRef > 0) {
        qualityIssues++
        warnings.push(`${missingOutcomeRef} communications missing outcomeRef`)
      }

      // Check 2: Track delivered vs failed sends
      const failedSends = todayComms.filter((c: typeof todayComms[number]) => c.status === "failed").length
      if (failedSends > 0) {
        qualityIssues++
        warnings.push(`${failedSends} communications failed to send`)
      }

      // Check 3: Communications should have tracking data
      const missingTrackingData = todayComms.filter(
        (c) => c.status === "sent" && !c.outcome && !c.outcomeAt
      ).length

      if (missingTrackingData > 0) {
        warnings.push(
          `${missingTrackingData} sent communications missing outcome tracking (may be in progress)`
        )
      }

      itemsFailed = qualityIssues

      // Calculate communication effectiveness
      const sentComms = todayComms.filter((c) => c.status === "sent").length
      const withOutcomes = todayComms.filter((c) => c.outcome).length
      const successfulOutcomes = todayComms.filter(
        (c) => c.outcome === "converted" || c.outcome === "replied"
      ).length

      const successRate = sentComms > 0 ? (successfulOutcomes / sentComms) * 100 : 0

      const metrics = {
        commsAudited: itemsProcessed,
        qualityIssues: itemsFailed,
        commsSent: sentComms,
        commsWithOutcomes: withOutcomes,
        successfulOutcomes: successfulOutcomes,
        successRate: successRate.toFixed(1) + "%",
        failedSends: failedSends,
      }

      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Daily audit failed: ${errorMsg}`)
      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings)
    }
  }

  /**
   * Weekly workflow (Sunday 11pm IST):
   * Full decision validation and reasoning audit
   */
  private async handleWeeklyDecisionValidation(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    let itemsFailed = 0
    const warnings: string[] = []

    try {
      // Get all decisions from last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      // In production: query AgentDecision table
      // For now: validate communications which are a proxy for decisions
      const weekComms = await db.communication.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      })

      itemsProcessed = weekComms.length

      // Validation checks
      let validationIssues = 0

      // Check 1: All decisions should have documented reasoning (outcomeRef)
      const missingReasoning = weekComms.filter((c) => !c.outcomeRef).length
      if (missingReasoning > 0) {
        validationIssues++
        warnings.push(`${missingReasoning} decisions missing documented reasoning`)
      }

      // Check 2: All decisions should be trackable (communication has outcome field)
      const untrackableDecisions = weekComms.filter((c) => !c.outcome && c.status === "sent").length
      if (untrackableDecisions > 0) {
        warnings.push(`${untrackableDecisions} decisions sent but outcome not yet tracked`)
      }

      // Check 3: Look for high-quality outcomes (converted, replied) vs ignored
      const convertedComms = weekComms.filter((c) => c.outcome === "converted").length
      const repliedComms = weekComms.filter((c) => c.outcome === "replied").length
      const ignoredComms = weekComms.filter((c) => c.outcome === "ignored").length

      const highQualityRate =
        weekComms.length > 0
          ? ((convertedComms + repliedComms) / weekComms.length) * 100
          : 0

      if (highQualityRate < 50) {
        warnings.push(
          `Low decision quality: only ${highQualityRate.toFixed(1)}% of decisions had positive outcomes`
        )
      }

      itemsFailed = validationIssues

      const metrics = {
        decisionsAudited: itemsProcessed,
        validationIssues: itemsFailed,
        convertedOutcomes: convertedComms,
        repliedOutcomes: repliedComms,
        ignoredOutcomes: ignoredComms,
        highQualityRate: highQualityRate.toFixed(1) + "%",
      }

      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Weekly validation failed: ${errorMsg}`)
      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings)
    }
  }

  /**
   * Monthly workflow (30th, 11pm IST):
   * Communication quality report and optimization recommendations
   */
  private async handleMonthlyQualityReport(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    let itemsFailed = 0
    const warnings: string[] = []

    try {
      // Get all communications from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const monthComms = await db.communication.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
      })

      itemsProcessed = monthComms.length

      if (monthComms.length === 0) {
        warnings.push("No communications this month - skipping quality report")
        return this.partialResult(ctx, 0, 0, warnings, { reportGenerated: "false" })
      }

      // Comprehensive quality analysis
      const sentComms = monthComms.filter((c) => c.status === "sent").length
      const failedSends = monthComms.filter((c) => c.status === "failed").length
      const pendingComms = monthComms.filter((c) => c.status === "pending").length

      const withOutcomes = monthComms.filter((c) => c.outcome).length
      const convertedComms = monthComms.filter((c) => c.outcome === "converted").length
      const repliedComms = monthComms.filter((c) => c.outcome === "replied").length
      const ignoredComms = monthComms.filter((c) => c.outcome === "ignored").length
      const blockedComms = monthComms.filter((c) => c.outcome === "blocked").length

      // Calculate quality score (0-100)
      const deliveryRate = sentComms > 0 ? ((sentComms - failedSends) / sentComms) * 100 : 0
      const conversionRate = sentComms > 0 ? (convertedComms / sentComms) * 100 : 0
      const engagementRate =
        sentComms > 0 ? ((convertedComms + repliedComms) / sentComms) * 100 : 0

      const qualityScore = (deliveryRate * 0.3 + engagementRate * 0.7).toFixed(1)

      // Generate recommendations
      let recommendations = 0

      if (deliveryRate < 95) {
        warnings.push("Recommendation: Improve email delivery rate (currently " + deliveryRate.toFixed(1) + "%)")
        recommendations++
      }

      if (conversionRate < 10) {
        warnings.push(
          "Recommendation: Review message content - conversion rate is below benchmark (currently " + conversionRate.toFixed(1) + "%)"
        )
        recommendations++
      }

      if (blockedComms > sentComms * 0.05) {
        warnings.push("Recommendation: Customer blocking rate is high - review frequency capping")
        recommendations++
      }

      itemsFailed = recommendations

      const metrics = {
        monthlyCommsProcessed: itemsProcessed,
        sentComms: sentComms,
        failedSends: failedSends,
        pendingComms: pendingComms,
        withOutcomes: withOutcomes,
        convertedComms: convertedComms,
        repliedComms: repliedComms,
        ignoredComms: ignoredComms,
        blockedComms: blockedComms,
        deliveryRate: deliveryRate.toFixed(1) + "%",
        conversionRate: conversionRate.toFixed(1) + "%",
        engagementRate: engagementRate.toFixed(1) + "%",
        qualityScore: qualityScore,
        recommendationsCount: recommendations,
      }

      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Monthly report failed: ${errorMsg}`)
      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings)
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
   * Validate qa-audit-specific config
   */
  async validateConfig(): Promise<void> {
    await super.validateConfig()

    if (!["daily", "weekly", "monthly"].includes(this.config.schedule)) {
      throw new Error(
        `Invalid schedule for QAAuditSubagent: ${this.config.schedule}. Must be one of: daily, weekly, monthly`
      )
    }
  }
}

/**
 * Factory function to create all three instances of QAAuditSubagent
 */
export function createQAAuditSubagents(): QAAuditSubagent[] {
  return [
    // Daily: Communication quality audit at 11pm IST
    new QAAuditSubagent({
      id: "qa-audit-daily",
      type: "qa-audit",
      name: "QA Audit - Daily Communication Audit",
      description: "Audit daily communication quality and track outcomes",
      schedule: "daily",
      scheduledTime: "23:00",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 2,
        backoffMs: 5000,
        backoffMultiplier: 2,
      },
      timeoutMs: 300000, // 5 minutes
      enabled: true,
    }),

    // Weekly: Decision validation Sunday 11pm IST
    new QAAuditSubagent({
      id: "qa-audit-weekly",
      type: "qa-audit",
      name: "QA Audit - Weekly Decision Validation",
      description: "Full decision validation and reasoning audit",
      schedule: "weekly",
      scheduledTime: "Sunday 23:00",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 1,
        backoffMs: 10000,
        backoffMultiplier: 2,
      },
      timeoutMs: 600000, // 10 minutes
      enabled: true,
    }),

    // Monthly: Quality report 30th at 11pm IST
    new QAAuditSubagent({
      id: "qa-audit-monthly",
      type: "qa-audit",
      name: "QA Audit - Monthly Quality Report",
      description: "Communication quality report and optimization recommendations",
      schedule: "monthly",
      scheduledTime: "30 23:00",
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
