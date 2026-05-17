import { Worker, type Job } from "bullmq"
import { db } from "@d2c/database"
import { createRedisConnection } from "../redis"
import { queueCommunication } from "../queues"
import type { RetentionJobData } from "../queues"
import { getCustomerMemory, decideRetention, CalendarAgent } from "../../agents"
import { AgentOrchestrator, type AgentProposal, AgentDomain, DecisionAction } from "../../orchestrator"
import { recordOutcome } from "../../learning/feedback-loop"

const BATCH_SIZE = 100

// ─── Scoring Helpers ──────────────────────────────────────────────────────────

function recencyScore(daysSinceLastOrder: number | null): number {
  if (daysSinceLastOrder === null) return 0
  if (daysSinceLastOrder < 30) return 100
  if (daysSinceLastOrder < 60) return 70
  if (daysSinceLastOrder < 90) return 40
  if (daysSinceLastOrder < 180) return 15
  return 0
}

function frequencyScore(totalOrders: number): number {
  if (totalOrders <= 1) return 10
  if (totalOrders <= 3) return 40
  if (totalOrders <= 6) return 70
  return 100
}

function monetaryScore(totalSpend: number): number {
  if (totalSpend < 500) return 10
  if (totalSpend < 2000) return 40
  if (totalSpend < 5000) return 70
  return 100
}

function computeChurnScore(rec: number, freq: number, mon: number): number {
  const rfm = rec * 0.5 + freq * 0.3 + mon * 0.2
  return Math.max(0, Math.min(100, 100 - Math.round(rfm)))
}

function computeLtvTier(totalSpend: number): string {
  if (totalSpend < 500) return "new"
  if (totalSpend < 2000) return "low"
  if (totalSpend < 5000) return "mid"
  if (totalSpend < 15000) return "high"
  return "vip"
}

function computeLifecycleStage(
  totalOrders: number,
  totalSpend: number,
  daysSinceLastOrder: number | null
): string {
  if (totalOrders === 0) return "new"

  const days = daysSinceLastOrder ?? Infinity

  // Champion: frequent, high-spend, recently active
  if (totalOrders >= 5 && totalSpend >= 5000 && days <= 45) return "champion"

  if (days <= 30) return "active"
  if (days <= 60) return "at_risk"
  if (days <= 180) return "lapsed"
  return "churned"
}

function computeNextActionAt(stage: string): Date {
  const now = Date.now()
  switch (stage) {
    case "active":
    case "champion":
      return new Date(now + 14 * 86_400_000)   // 14 days
    case "at_risk":
      return new Date(now + 1 * 86_400_000)    // tomorrow
    case "lapsed":
      return new Date(now + 3 * 86_400_000)    // 3 days
    case "churned":
    case "new":
    default:
      return new Date(now + 7 * 86_400_000)    // 7 days
  }
}

// ─── Communication Triggers ───────────────────────────────────────────────────

type StageTransition = { from: string; to: string }

function shouldTriggerComm(transition: StageTransition): string | null {
  const { from, to } = transition

  if (from === "new" && to === "active") return "retention_welcome"
  if (from === "active" && to === "at_risk") return "retention_at_risk"
  if (
    (from === "at_risk" && to === "lapsed") ||
    (from === "active" && to === "lapsed")
  )
    return "retention_lapsed"

  // Churned is handled by the winback worker — skip here
  return null
}

// ─── Per-customer scoring ─────────────────────────────────────────────────────

type CustomerRow = {
  id: string
  shopId: string
  phone: string | null
  totalOrders: number
  totalSpend: number
  lastOrderAt: Date | null
  lifecycleStage: string
}

type CustomerUpdate = {
  id: string
  shopId: string
  phone: string | null
  churnScore: number
  ltvTier: string
  lifecycleStage: string
  nextActionAt: Date
  prevStage: string
}

function scoreCustomer(customer: CustomerRow): CustomerUpdate {
  const now = Date.now()
  const daysSince = customer.lastOrderAt
    ? Math.floor((now - customer.lastOrderAt.getTime()) / 86_400_000)
    : null

  const rec = recencyScore(daysSince)
  const freq = frequencyScore(customer.totalOrders)
  const mon = monetaryScore(customer.totalSpend)

  const churnScore = computeChurnScore(rec, freq, mon)
  const ltvTier = computeLtvTier(customer.totalSpend)
  const lifecycleStage = computeLifecycleStage(
    customer.totalOrders,
    customer.totalSpend,
    daysSince
  )
  const nextActionAt = computeNextActionAt(lifecycleStage)

  return {
    id: customer.id,
    shopId: customer.shopId,
    phone: customer.phone,
    churnScore,
    ltvTier,
    lifecycleStage,
    nextActionAt,
    prevStage: customer.lifecycleStage,
  }
}

// ─── Per-shop processing ──────────────────────────────────────────────────────

async function processShop(shopId: string, job: Job<RetentionJobData>) {
  let skip = 0
  let totalProcessed = 0
  let totalComms = 0

  while (true) {
    const customers = await db.customer.findMany({
      where: { shopId },
      select: {
        id: true,
        shopId: true,
        phone: true,
        totalOrders: true,
        totalSpend: true,
        lastOrderAt: true,
        lifecycleStage: true,
      },
      skip,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
    })

    if (customers.length === 0) break

    const updates = customers.map(scoreCustomer)

    // Bulk update scores — parallel within the batch
    await Promise.all(
      updates.map((u) =>
        db.customer.update({
          where: { id: u.id },
          data: {
            churnScore: u.churnScore,
            ltvTier: u.ltvTier,
            lifecycleStage: u.lifecycleStage,
            nextActionAt: u.nextActionAt,
          },
        })
      )
    )

    // Queue comms for stage changes — using Decision Agent
    const calendar = new CalendarAgent()

    for (const u of updates) {
      if (!u.phone) continue

      // Load customer memory for decision making
      const memory = await getCustomerMemory(u.id)

      // Decide action using Retention Decision Agent
      const decision = await decideRetention(memory, {
        lifecycleStage: u.lifecycleStage,
        churnScore: u.churnScore,
        daysSinceLastOrder: u.lifecycleStage === "new" ? 0 :
          Math.floor((Date.now() - (memory.lastOrderDate?.getTime() || Date.now())) / 86_400_000),
        avgOrderValue: memory.avgOrderValue,
      })

      // ────────────────────────────────────────────────────────────────────────────
      // ORCHESTRATOR INTEGRATION (Phase 5)
      // ────────────────────────────────────────────────────────────────────────────

      // Create proposal for orchestrator coordination
      const proposal: AgentProposal = {
        agentDomain: AgentDomain.Marketing,
        agentName: "retention",
        customerId: u.id,
        action: DecisionAction.SendMessage,
        reasoning: `Lifecycle stage: ${u.lifecycleStage}. Churn score: ${u.churnScore}. Stage transition: ${u.prevStage} → ${u.lifecycleStage}. Intent: ${decision.offerType}`,
        context: {
          customerId: u.id,
          lifecycleStage: u.lifecycleStage,
          prevStage: u.prevStage,
          churnScore: u.churnScore,
          ltvTier: memory.ltvTier,
          offerType: decision.offerType,
        },
        confidence: 70,
        priority: u.lifecycleStage === "at_risk" ? "high" : "medium",
        retryable: true,
        idempotencyKey: `retention-${u.id}-${u.lifecycleStage}-${Date.now()}`,
      }

      // Get orchestrator approval
      const orchestratorDecision = await AgentOrchestrator.propose(proposal, memory)

      if (!orchestratorDecision.approved) {
        continue
      }

      if (decision.action === "send") {
        // Execute orchestrator decision
        const outcome = await AgentOrchestrator.execute(proposal, orchestratorDecision)

        // Stage transition determines trigger type
        const triggerType = shouldTriggerComm({
          from: u.prevStage,
          to: u.lifecycleStage,
        })

        await queueCommunication({
          shopId: u.shopId,
          customerId: u.id,
          phone: u.phone,
          channel: "whatsapp",
          triggerType: triggerType || `retention_${u.lifecycleStage}`,
          triggerRef: u.id,
          priority: u.lifecycleStage === "at_risk" ? "high" : "medium",
        })

        // Record outcome for learning loop
        await recordOutcome(outcome.proposalId, "success", {
          customerId: u.id,
          lifecycleStage: u.lifecycleStage,
          churnScore: u.churnScore,
          sentAt: new Date(),
          channel: "whatsapp",
        })

        await calendar.recordSent(u.id, "marketing")
        totalComms++
      } else if (decision.action === "silence_90d") {
        // Set a hold on marketing comms
        await calendar.hold(u.id, "Silent period for customer", new Date(Date.now() + 90 * 86_400_000))
      }
    }

    totalProcessed += customers.length
    skip += BATCH_SIZE

    job.log(
      `[retention] shop=${shopId} processed=${totalProcessed} comms=${totalComms}`
    )

    if (customers.length < BATCH_SIZE) break
  }

  return { shopId, totalProcessed, totalComms }
}

// ─── Job Handler ──────────────────────────────────────────────────────────────

async function processRetentionJob(job: Job<RetentionJobData>) {
  const { shopId } = job.data

  // Single-shop mode
  if (shopId) {
    job.log(`[retention] single-shop mode: ${shopId}`)
    const result = await processShop(shopId, job)
    return { shops: [result] }
  }

  // Sweep mode — find all active shops
  const shops = await db.shop.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  job.log(`[retention] sweep mode: ${shops.length} active shops`)

  const results = []
  for (const shop of shops) {
    const result = await processShop(shop.id, job)
    results.push(result)
  }

  const totalProcessed = results.reduce((sum, r) => sum + r.totalProcessed, 0)
  const totalComms = results.reduce((sum, r) => sum + r.totalComms, 0)

  job.log(
    `[retention] sweep complete — shops=${shops.length} customers=${totalProcessed} comms=${totalComms}`
  )

  return { shops: results, totalProcessed, totalComms }
}

// ─── Worker Export ────────────────────────────────────────────────────────────

export function startRetentionWorker(): Worker {
  const worker = new Worker<RetentionJobData>(
    "retention",
    processRetentionJob,
    {
      connection: createRedisConnection(),
      concurrency: 2, // heavy DB work — keep low
    }
  )

  worker.on("completed", (job, result) => {
    const { totalProcessed, totalComms } = result as {
      totalProcessed?: number
      totalComms?: number
      shops: unknown[]
    }
    console.log(
      `[retention] ✓ job=${job.id} customers=${totalProcessed ?? "?"} comms=${totalComms ?? "?"}`
    )
  })

  worker.on("failed", (job, err) => {
    console.error(`[retention] ✗ ${job?.id} — ${err.message}`)
  })

  return worker
}
