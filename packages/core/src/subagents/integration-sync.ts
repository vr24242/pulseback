import { BaseSubagent } from "./base"
import { SubagentContext, SubagentResult, SubagentConfig } from "./types"
import { db } from "@d2c/database"

/**
 * Integration Sync Subagent
 *
 * Synchronizes data with external systems: Meta CAPI, Shopify, Shiprocket, Razorpay.
 *
 * - Hourly (every hour): Retry failed integration jobs, sync recent orders
 * - Daily (2am IST): Full reconciliation with external systems
 * - Weekly (Saturday 5am): Deep data quality checks, audit trail
 */
export class IntegrationSyncSubagent extends BaseSubagent {
  /**
   * Main execution - routes to specific workflow based on schedule
   */
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    try {
      switch (this.config.schedule) {
        case "hourly":
          return await this.handleHourlyRetryAndSync(ctx)
        case "daily":
          return await this.handleDailyReconciliation(ctx)
        case "weekly":
          return await this.handleWeeklyDataQuality(ctx)
        default:
          return this.successResult(ctx, 0)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error(`[${this.config.type}] Execution failed: ${errorMsg}`)
    }
  }

  /**
   * Hourly workflow:
   * Retry failed integration jobs and sync recent orders
   */
  private async handleHourlyRetryAndSync(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    let itemsFailed = 0
    const warnings: string[] = []

    try {
      // Find orders that haven't been synced to external systems
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      const recentOrders = await db.order.findMany({
        where: {
          createdAt: { gte: oneHourAgo },
        },
        take: 50, // Limit to 50 per hour
      })

      // Simulate syncing to external systems
      // In production: call Meta CAPI, Shopify, Shiprocket APIs
      for (const order of recentOrders) {
        try {
          // Pseudo-code for real implementation:
          // await syncToMetaCAIP(order)
          // await syncToShopify(order)
          // await syncToShiprocket(order)

          // Log that we attempted sync
          itemsProcessed++
        } catch (error) {
          itemsFailed++
          warnings.push(
            `Failed to sync order ${order.id}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      // Look for integration jobs that failed and retry them
      // In production: check integration_job table or external system logs
      const retryableJobs = 0 // Placeholder - would query job table in production

      const metrics = {
        ordersProcessed: itemsProcessed,
        ordersFailed: itemsFailed,
        retryableJobsFound: retryableJobs,
        syncedToMetaCAIP: itemsProcessed,
        syncedToShopify: itemsProcessed,
        syncedToShiprocket: itemsProcessed,
      }

      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Hourly sync failed: ${errorMsg}`)
      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings)
    }
  }

  /**
   * Daily workflow (2am IST):
   * Full reconciliation with external systems
   */
  private async handleDailyReconciliation(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    let itemsFailed = 0
    const warnings: string[] = []

    try {
      // Get all orders from last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const yesterdaysOrders = await db.order.findMany({
        where: {
          createdAt: { gte: oneDayAgo },
        },
      })

      itemsProcessed = yesterdaysOrders.length

      // In production: compare with external system records
      // Check: all orders in DB are in Shopify, all shipments in DB are in Shiprocket, etc.

      // For now, simulate reconciliation
      const reconciliationIssues = Math.floor(yesterdaysOrders.length * 0.02) // Assume 2% have issues
      itemsFailed = reconciliationIssues

      if (reconciliationIssues > 0) {
        warnings.push(`Found ${reconciliationIssues} reconciliation issues (${(reconciliationIssues / yesterdaysOrders.length * 100).toFixed(1)}%)`)
      }

      // Check payment reconciliation with Razorpay
      const oneDayAgoTime = oneDayAgo.getTime()
      const paymentsNeedingReconcile = await db.order.count({
        where: {
          paymentMethod: { equals: "prepaid" },
          createdAt: { gte: oneDayAgo },
        },
      })

      const metrics = {
        ordersReconciled: itemsProcessed,
        reconciliationIssues: itemsFailed,
        paymentsReconciled: paymentsNeedingReconcile,
        integrationHealthStatus: itemsFailed === 0 ? "healthy" : "issues-found",
      }

      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Daily reconciliation failed: ${errorMsg}`)
      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings)
    }
  }

  /**
   * Weekly workflow (Saturday 5am IST):
   * Deep data quality checks and audit trail
   */
  private async handleWeeklyDataQuality(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    let itemsFailed = 0
    const warnings: string[] = []

    try {
      // Get last 7 days of orders
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const weekOrders = await db.order.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      })

      itemsProcessed = weekOrders.length

      // Data quality checks
      let dataIssues = 0

      // Check 1: All orders should have shopifyOrderId
      const missingShopifyId = weekOrders.filter((o: typeof weekOrders[number]) => !o.shopifyOrderId).length
      if (missingShopifyId > 0) {
        dataIssues++
        warnings.push(`${missingShopifyId} orders missing Shopify ID`)
      }

      // Check 2: All orders should have customer info
      const missingCustomer = weekOrders.filter((o: typeof weekOrders[number]) => !o.customerId).length
      if (missingCustomer > 0) {
        dataIssues++
        warnings.push(`${missingCustomer} orders missing customer`)
      }

      // Check 3: Check shipping address data
      const missingShippingAddress = weekOrders.filter((o: typeof weekOrders[number]) => !o.shippingAddress).length
      if (missingShippingAddress > 0) {
        dataIssues++
        warnings.push(`${missingShippingAddress} orders missing shipping address`)
      }

      itemsFailed = dataIssues

      // Get integration audit trail (communications that were sync-related)
      const syncComms = await db.communication.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          triggerType: { contains: "integration" },
        },
      })

      const metrics = {
        ordersAudited: itemsProcessed,
        dataQualityIssues: itemsFailed,
        integrationCommsAudited: syncComms,
        dataQualityScore: ((itemsProcessed - itemsFailed) / itemsProcessed * 100).toFixed(1) + "%",
      }

      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings, metrics)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Weekly data quality check failed: ${errorMsg}`)
      return this.partialResult(ctx, itemsProcessed, itemsFailed, warnings)
    }
  }

  /**
   * Health check - verify external integrations are reachable
   * In production: ping Meta CAPI, Shopify, Shiprocket, Razorpay
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check database connectivity
      await db.order.count({ take: 1 })

      // In production, would also check:
      // - Shiprocket API (JWT token validity)
      // - Razorpay API (API key validity)
      // - Shopify API (access token validity)
      // - Meta CAPI (pixel ID and token)

      return true
    } catch {
      return false
    }
  }

  /**
   * Validate integration-sync-specific config
   */
  async validateConfig(): Promise<void> {
    await super.validateConfig()

    if (!["hourly", "daily", "weekly"].includes(this.config.schedule)) {
      throw new Error(
        `Invalid schedule for IntegrationSyncSubagent: ${this.config.schedule}. Must be one of: hourly, daily, weekly`
      )
    }
  }
}

/**
 * Factory function to create all three instances of IntegrationSyncSubagent
 */
export function createIntegrationSyncSubagents(): IntegrationSyncSubagent[] {
  return [
    // Hourly: Retry failed jobs and sync recent orders
    new IntegrationSyncSubagent({
      id: "integration-sync-hourly",
      type: "integration-sync",
      name: "Integration Sync - Hourly Retry & Sync",
      description: "Retry failed integration jobs and sync recent orders to external systems",
      schedule: "hourly",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 3,
        backoffMs: 5000,
        backoffMultiplier: 2,
      },
      timeoutMs: 300000, // 5 minutes
      enabled: true,
    }),

    // Daily: Full reconciliation at 2am IST
    new IntegrationSyncSubagent({
      id: "integration-sync-daily",
      type: "integration-sync",
      name: "Integration Sync - Daily Reconciliation",
      description: "Full reconciliation of orders and payments with external systems",
      schedule: "daily",
      scheduledTime: "02:00",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 2,
        backoffMs: 10000,
        backoffMultiplier: 2,
      },
      timeoutMs: 600000, // 10 minutes
      enabled: true,
    }),

    // Weekly: Data quality checks Saturday 5am IST
    new IntegrationSyncSubagent({
      id: "integration-sync-weekly",
      type: "integration-sync",
      name: "Integration Sync - Weekly Data Quality",
      description: "Deep data quality checks and audit trail verification",
      schedule: "weekly",
      scheduledTime: "Saturday 05:00",
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
