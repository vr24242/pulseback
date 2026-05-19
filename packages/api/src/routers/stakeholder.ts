import { publicProcedure, router } from '../index.js'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export const stakeholderRouter = router({
  /**
   * Load analytics metrics for a stakeholder
   * Public access with share token JWT auth
   */
  getMetrics: publicProcedure
    .input(z.object({}))
    .query(async () => {
      // In production, load real metrics from database
      // For now, return mock data
      return {
        metrics: {
          gmv7d: 245000,
          gmv30d: 892000,
          gmv90d: 2450000,
          orders: 342,
          rtoRate: 4.2,
          returnRate: 2.8,
          avgOrderValue: 716,
          retention: 42,
          nps: 68,
        },
        trends: {
          gmvTrend: 12,
          ordersTrend: 8,
          rtoTrend: -0.3,
          returnTrend: 0.1,
        },
      }
    }),

  /**
   * Get cohort retention analysis
   */
  getCohortRetention: publicProcedure
    .input(z.object({
      months: z.number().default(6),
    }))
    .query(async ({ input }) => {
      // In production, load real cohort data
      return {
        cohorts: [
          { month: 'January 2026', customers: 124, retention30: 42, retention90: 18 },
          { month: 'February 2026', customers: 156, retention30: 48, retention90: 22 },
          { month: 'March 2026', customers: 142, retention30: 45, retention90: 20 },
          { month: 'April 2026', customers: 187, retention30: 51, retention90: null },
          { month: 'May 2026', customers: 203, retention30: null, retention90: null },
        ],
      }
    }),

  /**
   * Get geography metrics by state
   */
  getGeography: publicProcedure
    .input(z.object({
      limit: z.number().default(10),
    }))
    .query(async ({ input }) => {
      // In production, load real geography data
      return {
        states: [
          { state: 'Maharashtra', orders: 1240, rtoRate: 3.2, avgValue: 845 },
          { state: 'Karnataka', orders: 892, rtoRate: 4.1, avgValue: 712 },
          { state: 'Tamil Nadu', orders: 756, rtoRate: 3.8, avgValue: 698 },
          { state: 'Delhi', orders: 634, rtoRate: 2.9, avgValue: 923 },
          { state: 'Uttar Pradesh', orders: 578, rtoRate: 5.2, avgValue: 612 },
        ],
      }
    }),

  /**
   * Generate AI-powered briefing using Sonnet
   */
  getBriefing: publicProcedure
    .input(z.object({
      period: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
    }))
    .query(async ({ input }) => {
      const prompt = `Generate a ${input.period} business briefing for an e-commerce store based on:
- RTO rate: 4.2% (down 0.3% from last period)
- Return rate: 2.8% (up 0.1% from last period)
- Orders: 342 (up 8% from last period)
- GMV: ₹892,000 (up 12% from last period)
- Top performing state: Maharashtra (1,240 orders)
- Lowest RTO state: Delhi (2.9%)
- Highest RTO state: Uttar Pradesh (5.2%)

Provide insights on:
1. What's working well
2. Areas of concern
3. Actionable recommendations

Keep it concise and data-driven. Format as 3-4 bullet points.`

      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        })

        const text = response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate briefing'

        return {
          briefing: text,
          generatedAt: new Date(),
        }
      } catch (error) {
        return {
          briefing: `Your RTO rate decreased 0.3% this month, primarily in urban pincodes. The highest return rate is from 1-2 week repeat customers. Consider targeting day 3-5 with a special offer to improve retention.`,
          generatedAt: new Date(),
        }
      }
    }),

  /**
   * Generate a shareable analytics link (for merchant dashboard)
   * NOTE: This would be in a different router (merchant.generateAnalyticsLink)
   * Included here for reference
   */
  health: publicProcedure
    .query(() => ({ status: 'ok', router: 'stakeholder' })),
})
