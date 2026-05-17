/**
 * LEARNING LOOP — Phase 5 Intelligence Compounding
 *
 * This is what makes PulseOS compound. Every agent decision is recorded with its outcome.
 * The learning loop analyzes these outcomes to improve future decisions.
 *
 * Three mechanisms:
 * 1. Success Rate Tracking — which agents/decisions work best for which segments?
 * 2. Pattern Discovery — Sonnet analyzes weekly patterns ("Tuesday 6pm WA converts 3.1x")
 * 3. Weight Adjustment — future agents use improved weights based on historical performance
 *
 * The system day 1 is rules-based. By day 90 it's data-driven.
 */

import { db } from "@d2c/database"
import { Anthropic } from "@anthropic-ai/sdk"

const anthropic = new Anthropic()

// ──────────────────────────────────────────────────────────────────────────────
// OUTCOME TRACKING
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Record the outcome of an executed agent decision
 * Called by workers after an action completes
 */
export async function recordOutcome(
  decisionId: string,
  outcome: "success" | "partial" | "failure",
  metadata?: Record<string, any>
): Promise<void> {
  const decision = await db.agentDecision.findUnique({
    where: { id: decisionId },
    include: { customer: true },
  })

  if (!decision) {
    throw new Error(`Decision ${decisionId} not found`)
  }

  // Update decision with outcome
  await db.agentDecision.update({
    where: { id: decisionId },
    data: {
      result: {
        outcome,
        ...metadata,
        recordedAt: new Date(),
      },
    },
  })

  // Record in learningOutcome table for faster querying
  await db.learningOutcome.create({
    data: {
      decisionId,
      customerId: decision.customerId,
      agentDomain: decision.agentDomain,
      agentName: decision.agentName,
      action: decision.action,
      outcome,
      confidence: decision.confidence,
      metadata: metadata || {},
    },
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// SUCCESS RATE ANALYSIS
// ──────────────────────────────────────────────────────────────────────────────

export interface AgentMetrics {
  agentDomain: string
  agentName: string
  action: string
  totalDecisions: number
  successCount: number
  partialCount: number
  failureCount: number
  successRate: number // 0-1
  avgConfidence: number // 0-100
  lastAnalyzedAt: Date
}

/**
 * Compute success rates for each agent/action combination
 * Run daily to track performance trends
 */
export async function computeAgentMetrics(
  shopId?: string,
  lookbackDays: number = 7
): Promise<AgentMetrics[]> {
  const cutoff = new Date(Date.now() - lookbackDays * 86400 * 1000)

  const outcomes = await db.learningOutcome.findMany({
    where: {
      createdAt: { gte: cutoff },
      // Optionally filter by shop if specified
      ...(shopId
        ? {
            decision: {
              customer: { shopId },
            },
          }
        : {}),
    },
    select: {
      agentDomain: true,
      agentName: true,
      action: true,
      outcome: true,
      confidence: true,
    },
  })

  // Group and compute metrics
  const grouped = new Map<string, AgentMetrics>()

  for (const outcome of outcomes) {
    const key = `${outcome.agentDomain}:${outcome.agentName}:${outcome.action}`

    if (!grouped.has(key)) {
      grouped.set(key, {
        agentDomain: outcome.agentDomain,
        agentName: outcome.agentName,
        action: outcome.action,
        totalDecisions: 0,
        successCount: 0,
        partialCount: 0,
        failureCount: 0,
        successRate: 0,
        avgConfidence: 0,
        lastAnalyzedAt: new Date(),
      })
    }

    const metrics = grouped.get(key)!
    metrics.totalDecisions += 1

    if (outcome.outcome === "success") metrics.successCount += 1
    else if (outcome.outcome === "partial") metrics.partialCount += 1
    else if (outcome.outcome === "failure") metrics.failureCount += 1
  }

  // Compute derived metrics
  const results = Array.from(grouped.values()).map((m) => {
    const confidentOutcomes = outcomes.filter(
      (o) =>
        `${o.agentDomain}:${o.agentName}:${o.action}` ===
        `${m.agentDomain}:${m.agentName}:${m.action}`
    )

    return {
      ...m,
      successRate:
        m.totalDecisions > 0
          ? (m.successCount + m.partialCount * 0.5) / m.totalDecisions
          : 0,
      avgConfidence:
        confidentOutcomes.length > 0
          ? confidentOutcomes.reduce((sum, o) => sum + o.confidence, 0) /
            confidentOutcomes.length
          : 0,
    }
  })

  return results.sort((a, b) => b.successRate - a.successRate)
}

// ──────────────────────────────────────────────────────────────────────────────
// PATTERN DISCOVERY (Weekly Analysis)
// ──────────────────────────────────────────────────────────────────────────────

export interface WeeklyPattern {
  insight: string
  confidence: number
  supportingData: Record<string, any>
  recommendation: string
}

/**
 * Run Sonnet to discover patterns in decision outcomes
 * Looks for insights like:
 * - "Tuesday 6pm WA converts 3.1x vs Sunday morning"
 * - "Customers with 3+ orders respond to discount offers 2.4x more"
 * - "NDR success rate is 12% higher in pincode 500001-500010"
 */
export async function analyzeWeeklyPatterns(shopId: string): Promise<WeeklyPattern[]> {
  const cutoff = new Date(Date.now() - 7 * 86400 * 1000)

  // Gather decision data for this shop
  const decisions = await db.agentDecision.findMany({
    where: {
      customer: { shopId },
      createdAt: { gte: cutoff },
    },
    include: {
      customer: {
        select: {
          phone: true,
          totalOrders: true,
          ltvTier: true,
          lifecycleStage: true,
          rtoRiskScore: true,
        },
      },
    },
    take: 500, // analyze recent 500 decisions
  })

  // Gather outcomes
  const outcomes = await db.learningOutcome.findMany({
    where: {
      decision: {
        customer: { shopId },
      },
      createdAt: { gte: cutoff },
    },
  })

  // Prepare data for Sonnet
  const dataForAnalysis = {
    totalDecisions: decisions.length,
    totalOutcomes: outcomes.length,
    successRate: outcomes.filter((o) => o.outcome === "success").length / outcomes.length,
    byAgent: groupBy(decisions, (d) => d.agentDomain),
    byAction: groupBy(decisions, (d) => d.action),
    byCustomerSegment: groupBy(decisions, (d) => {
      const c = d.customer
      if (!c) return "unknown"
      if (c.totalOrders > 5) return "loyal"
      if (c.totalOrders > 1) return "repeat"
      return "first_buyer"
    }),
    timeSeriesData: computeTimeSeriesMetrics(outcomes),
  }

  // Call Sonnet to analyze
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are a D2C commerce analytics expert. Analyze this week's agent decision outcomes and identify actionable patterns.

Data:
${JSON.stringify(dataForAnalysis, null, 2)}

Respond with JSON array of insights, max 3 patterns. Format:
[
  {
    "insight": "specific finding",
    "confidence": 0.85,
    "supportingData": { key metrics },
    "recommendation": "what to do with this insight"
  }
]

Only include patterns with >80% confidence. Focus on decisions that improve conversion or reduce cost.`,
      },
    ],
  })

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : ""
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    return JSON.parse(jsonMatch[0])
  } catch {
    console.error("Failed to parse Sonnet response:", response)
    return []
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// WEIGHT ADJUSTMENT (for future agents)
// ──────────────────────────────────────────────────────────────────────────────

export interface DecisionWeights {
  agentName: string
  action: string
  baseWeight: number
  segment: {
    [key: string]: number // per-segment weight adjustment
  }
  confidence: number
  lastUpdated: Date
}

/**
 * Compute adjusted weights for each agent/action based on outcomes
 * Future agent decisions can reference these weights
 */
export async function computeDecisionWeights(
  shopId: string
): Promise<Record<string, DecisionWeights>> {
  const metrics = await computeAgentMetrics(shopId, 30) // 30-day lookback

  const weights: Record<string, DecisionWeights> = {}

  for (const metric of metrics) {
    const key = `${metric.agentName}:${metric.action}`

    weights[key] = {
      agentName: metric.agentName,
      action: metric.action,
      baseWeight: Math.round(metric.successRate * 100),
      segment: {
        new: 60, // new customers less responsive to general offers
        repeat: 80,
        loyal: 95,
      },
      confidence: metric.avgConfidence,
      lastUpdated: new Date(),
    }
  }

  return weights
}

// ──────────────────────────────────────────────────────────────────────────────
// MERCHANT FEEDBACK INTEGRATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Record merchant feedback on an agent decision
 * Used to train the system: "I would have approved this differently"
 */
export async function recordMerchantFeedback(
  decisionId: string,
  merchantDecision: "approved" | "overridden" | "escalated",
  reason?: string
): Promise<void> {
  const decision = await db.agentDecision.findUnique({
    where: { id: decisionId },
  })

  if (!decision) {
    throw new Error(`Decision ${decisionId} not found`)
  }

  // Create feedback record
  await db.agentFeedback.create({
    data: {
      decisionId,
      customerId: decision.customerId,
      agentDomain: decision.agentDomain,
      merchantDecision,
      merchantReason: reason,
    },
  })

  // If overridden, mark decision as "contradicted" for learning
  if (merchantDecision === "overridden") {
    await db.learningOutcome.create({
      data: {
        decisionId,
        customerId: decision.customerId,
        agentDomain: decision.agentDomain,
        agentName: decision.agentName,
        action: decision.action,
        outcome: "failure", // agent made wrong call
        confidence: decision.confidence,
        metadata: {
          reason: "merchant_override",
          merchantReason: reason,
        },
      },
    })
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ──────────────────────────────────────────────────────────────────────────────

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string
): Record<string, number> {
  const result: Record<string, number> = {}

  for (const item of items) {
    const key = keyFn(item)
    result[key] = (result[key] || 0) + 1
  }

  return result
}

function computeTimeSeriesMetrics(
  outcomes: any[]
): Record<string, number> {
  // Group by hour of day and day of week to find patterns
  const byHour: Record<number, number> = {}
  const byDayOfWeek: Record<number, number> = {}

  for (const outcome of outcomes) {
    const date = new Date(outcome.createdAt)
    const hour = date.getHours()
    const dayOfWeek = date.getDay()

    byHour[hour] = (byHour[hour] || 0) + (outcome.outcome === "success" ? 1 : 0)
    byDayOfWeek[dayOfWeek] = (byDayOfWeek[dayOfWeek] || 0) + (outcome.outcome === "success" ? 1 : 0)
  }

  return { byHour: Object.values(byHour).reduce((a, b) => a + b, 0), byDayOfWeek: Object.values(byDayOfWeek).reduce((a, b) => a + b, 0) }
}

export default {
  recordOutcome,
  computeAgentMetrics,
  analyzeWeeklyPatterns,
  computeDecisionWeights,
  recordMerchantFeedback,
}
