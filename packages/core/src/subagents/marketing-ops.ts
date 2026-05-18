import { BaseSubagent } from "./base"
import { SubagentContext, SubagentResult, SubagentConfig } from "./types"
import { prisma } from "@d2c/database"
import { Resend } from "resend"

/**
 * Marketing Ops Subagent
 *
 * Handles continuous background marketing workflows:
 * - Process new early adopter signups
 * - Send confirmation emails
 * - Send referral bonus notifications
 * - Recalculate ranks hourly
 * - Send weekly rank update emails
 * - Cold email outreach batching
 * - Early adopter segmentation and analytics
 *
 * Can be instantiated with different schedules:
 * - "hourly" for signup processing + rank recalculation
 * - "weekly" for weekly rank update emails
 * - "daily" for cold email outreach
 */
export class MarketingOpsSubagent extends BaseSubagent {
  private resend: Resend

  constructor(config: SubagentConfig) {
    super(config)
    this.resend = new Resend(process.env.RESEND_API_KEY)
  }

  /**
   * Main execution method - routes to specific workflow based on schedule
   */
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    try {
      switch (this.config.schedule) {
        case "hourly":
          return await this.handleHourlyWorkflow(ctx)
        case "weekly":
          return await this.handleWeeklyWorkflow(ctx)
        case "daily":
          return await this.handleDailyWorkflow(ctx)
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
   * - Process new signups since last run
   * - Send confirmation emails
   * - Recalculate all ranks
   * - Send referral bonus emails
   */
  private async handleHourlyWorkflow(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    let itemsFailed = 0
    const warnings: string[] = []

    try {
      // 1. Get all unprocessed signups
      const newSignups = await prisma.earlyAdopter.findMany({
        where: {
          emailsSent: { equals: 0 },
          status: "waitlist",
        },
        orderBy: { createdAt: "asc" },
      })

      // 2. Send confirmation emails to new signups
      for (const signup of newSignups) {
        try {
          await this.sendSignupConfirmation(signup)
          itemsProcessed++
        } catch (error) {
          itemsFailed++
          warnings.push(
            `Failed to send confirmation to ${signup.email}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      // 3. Recalculate all ranks
      const rankCalculationResult = await this.recalculateAllRanks()
      warnings.push(...rankCalculationResult.warnings)

      // 4. Send referral bonus emails (for signups that came via referral)
      for (const signup of newSignups) {
        if (signup.referredBy) {
          try {
            await this.sendReferralBonusEmail(signup)
          } catch (error) {
            warnings.push(
              `Failed to send referral bonus for ${signup.email}: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
      }

      return this.successResult(ctx, itemsProcessed, {
        unprocessedSignups: newSignups.length,
        successfulEmails: itemsProcessed,
        failedEmails: itemsFailed,
        ranksRecalculated: rankCalculationResult.ranksRecalculated,
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Weekly workflow:
   * - Send weekly rank update emails to all subscribers
   * - Include referral movement info
   */
  private async handleWeeklyWorkflow(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    let itemsFailed = 0
    const warnings: string[] = []

    try {
      // Get all active early adopters
      const earlyAdopters = await prisma.earlyAdopter.findMany({
        where: { status: "waitlist" },
        orderBy: { rank: "asc" },
      })

      // Send weekly rank update to each
      for (const adopter of earlyAdopters) {
        try {
          await this.sendWeeklyRankUpdate(adopter)
          itemsProcessed++

          // Update last email sent timestamp
          await prisma.earlyAdopter.update({
            where: { id: adopter.id },
            data: { lastEmailAt: new Date() },
          })
        } catch (error) {
          itemsFailed++
          warnings.push(
            `Failed to send weekly update to ${adopter.email}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      return this.successResult(ctx, itemsProcessed, {
        totalAdopters: earlyAdopters.length,
        emailsSent: itemsProcessed,
        emailsFailed: itemsFailed,
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Daily workflow:
   * - Batch cold email outreach to high-fit prospects
   * - Segment early adopters for targeted campaigns
   */
  private async handleDailyWorkflow(ctx: SubagentContext): Promise<SubagentResult> {
    let itemsProcessed = 0
    const warnings: string[] = []

    try {
      // Get early adopters segmented by company size (expected monthly orders)
      const largeCompanies = await prisma.earlyAdopter.findMany({
        where: {
          expectedOrders: { gte: 500 },
          status: "waitlist",
        },
        orderBy: { rank: "asc" },
        take: 20, // Daily batch limit
      })

      // For now, just count them (cold outreach would be triggered separately by merchant)
      itemsProcessed = largeCompanies.length

      // Generate daily analytics
      const totalAdopters = await prisma.earlyAdopter.count({
        where: { status: "waitlist" },
      })

      const referralCount = await prisma.earlyAdopter.count({
        where: {
          status: "waitlist",
          referredBy: { not: null },
        },
      })

      const metrics = {
        totalAdopters,
        referralSignups: referralCount,
        referralRate: ((referralCount / totalAdopters) * 100).toFixed(2) + "%",
        topCompanySizeSegment: largeCompanies.length,
      }

      return this.successResult(ctx, itemsProcessed, metrics)
    } catch (error) {
      throw error
    }
  }

  /**
   * Send signup confirmation email with referral code
   */
  private async sendSignupConfirmation(adopter: any): Promise<void> {
    const referralLink = `https://pulseos.com/early-access?ref=${adopter.referralCode}`

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to PulseOS! 🚀</h2>
        <p>Hi ${adopter.companyName},</p>
        <p>Thank you for joining the early access list. You're <strong>#${adopter.rank}</strong> in line!</p>

        <h3>Share your referral link to move up faster:</h3>
        <p><a href="${referralLink}" style="padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 4px;">${referralLink}</a></p>

        <h3>How it works:</h3>
        <ul>
          <li>Share your link with other D2C brands</li>
          <li>Each referral moves you up 10 positions</li>
          <li>Top referrers get lifetime founding member status</li>
        </ul>

        <p>We're launching PulseOS in production soon. The sooner you build your waitlist position, the earlier you get onboarded.</p>
        <p>Questions? Reply to this email.</p>

        <p>— The PulseOS Team</p>
      </div>
    `

    await this.resend.emails.send({
      from: "waitlist@pulseos.com",
      to: adopter.email,
      subject: `You're #${adopter.rank} in line for PulseOS 🚀`,
      html,
    })

    // Log email in database
    await prisma.emailLog.create({
      data: {
        email: adopter.email,
        type: "signup_confirmation",
        status: "sent",
        messageId: `signup_${adopter.id}_${Date.now()}`,
      },
    })

    // Update adoption record
    await prisma.earlyAdopter.update({
      where: { id: adopter.id },
      data: {
        emailsSent: { increment: 1 },
        lastEmailAt: new Date(),
      },
    })
  }

  /**
   * Send referral bonus email to referrer when friend signs up
   */
  private async sendReferralBonusEmail(newAdopter: any): Promise<void> {
    // Find the referrer
    const referrer = await prisma.earlyAdopter.findUnique({
      where: { referralCode: newAdopter.referredBy },
    })

    if (!referrer) return

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Someone joined via your link! 🎉</h2>
        <p>Hi ${referrer.companyName},</p>
        <p><strong>${newAdopter.companyName}</strong> just signed up using your referral link.</p>
        <p>You're now <strong>#${referrer.rank}</strong> in line (you've moved up from referrals!)</p>

        <h3>Your referral stats:</h3>
        <ul>
          <li>Total referrals: <strong>${referrer.referralCount}</strong></li>
          <li>Position boost: <strong>${referrer.referralCount * 10}</strong> positions</li>
        </ul>

        <p>Keep sharing to move up faster!</p>
        <p>— The PulseOS Team</p>
      </div>
    `

    await this.resend.emails.send({
      from: "waitlist@pulseos.com",
      to: referrer.email,
      subject: `${newAdopter.companyName} joined via your link!`,
      html,
    })

    // Log email
    await prisma.emailLog.create({
      data: {
        email: referrer.email,
        type: "referral_bonus",
        status: "sent",
        messageId: `referral_${newAdopter.id}_${Date.now()}`,
      },
    })
  }

  /**
   * Send weekly rank update email with movement info
   */
  private async sendWeeklyRankUpdate(adopter: any): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your PulseOS Waitlist Update 📊</h2>
        <p>Hi ${adopter.companyName},</p>
        <p>Here's your weekly waitlist update:</p>

        <h3>Your Position</h3>
        <ul style="font-size: 18px; font-weight: bold;">
          <li>Current Rank: <strong>#${adopter.rank}</strong></li>
          <li>Referrals: <strong>${adopter.referralCount}</strong></li>
          <li>Total Waitlist: <strong>1,200+</strong></li>
        </ul>

        <p>You're in the <strong>top ${Math.round((adopter.rank / 1200) * 100)}%</strong> of signups!</p>

        <h3>Boost your position</h3>
        <p>Share your referral link with other D2C founders: <a href="https://pulseos.com/early-access?ref=${adopter.referralCode}">https://pulseos.com/early-access?ref=${adopter.referralCode}</a></p>

        <p>— The PulseOS Team</p>
      </div>
    `

    await this.resend.emails.send({
      from: "waitlist@pulseos.com",
      to: adopter.email,
      subject: `Your PulseOS rank: #${adopter.rank} 📈`,
      html,
    })

    // Log email
    await prisma.emailLog.create({
      data: {
        email: adopter.email,
        type: "weekly_rank_update",
        status: "sent",
        messageId: `weekly_${adopter.id}_${Date.now()}`,
      },
    })
  }

  /**
   * Recalculate all ranks based on current signup order + referral boost
   * Each referral = +10 position boost
   */
  private async recalculateAllRanks(): Promise<{ ranksRecalculated: number; warnings: string[] }> {
    const warnings: string[] = []

    try {
      // Get all early adopters sorted by signup date (oldest first = highest rank = lowest number)
      const allAdopters = await prisma.earlyAdopter.findMany({
        where: { status: "waitlist" },
        orderBy: { createdAt: "asc" },
      })

      // Recalculate ranks: base rank - (referralCount * 10)
      for (let i = 0; i < allAdopters.length; i++) {
        const baseRank = i + 1
        const referralBoost = allAdopters[i].referralCount * 10
        const newRank = Math.max(1, baseRank - referralBoost) // Never go below rank 1

        await prisma.earlyAdopter.update({
          where: { id: allAdopters[i].id },
          data: { rank: newRank },
        })
      }

      return {
        ranksRecalculated: allAdopters.length,
        warnings,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      warnings.push(`Rank recalculation failed: ${errorMsg}`)
      return {
        ranksRecalculated: 0,
        warnings,
      }
    }
  }

  /**
   * Health check - verify Resend API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to get Resend account info as a health check
      const response = await fetch("https://api.resend.com/audiences", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Validate marketing ops specific config
   */
  async validateConfig(): Promise<void> {
    await super.validateConfig()

    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is required for MarketingOpsSubagent")
    }

    if (!["hourly", "weekly", "daily"].includes(this.config.schedule)) {
      throw new Error(
        `Invalid schedule for MarketingOpsSubagent: ${this.config.schedule}. Must be one of: hourly, weekly, daily`
      )
    }
  }
}

/**
 * Factory function to create all three instances of MarketingOpsSubagent
 * with different schedules
 */
export function createMarketingOpsSubagents(): MarketingOpsSubagent[] {
  return [
    // Hourly: Process signups, send confirmations, recalculate ranks, send referral emails
    new MarketingOpsSubagent({
      id: "marketing-ops-hourly",
      type: "marketing-ops",
      name: "Marketing Ops - Hourly Processor",
      description: "Process signups, send confirmations, recalculate ranks hourly",
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

    // Weekly: Send weekly rank update emails (every Sunday at 10:00 IST)
    new MarketingOpsSubagent({
      id: "marketing-ops-weekly",
      type: "marketing-ops",
      name: "Marketing Ops - Weekly Rank Updates",
      description: "Send weekly rank update emails to all early adopters",
      schedule: "weekly",
      scheduledTime: "Sunday 10:00",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 2,
        backoffMs: 10000,
        backoffMultiplier: 2,
      },
      timeoutMs: 600000, // 10 minutes
      enabled: true,
    }),

    // Daily: Cold email batching and analytics (daily at 8:00 IST)
    new MarketingOpsSubagent({
      id: "marketing-ops-daily",
      type: "marketing-ops",
      name: "Marketing Ops - Daily Cold Outreach",
      description: "Segment early adopters for cold email campaigns and generate daily analytics",
      schedule: "daily",
      scheduledTime: "08:00",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 2,
        backoffMs: 5000,
        backoffMultiplier: 2,
      },
      timeoutMs: 300000, // 5 minutes
      enabled: true,
    }),
  ]
}
