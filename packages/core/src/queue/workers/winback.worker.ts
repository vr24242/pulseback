import { Worker, type Job } from "bullmq"
import { db } from "@d2c/database"
import { createRedisConnection } from "../redis"
import { queueCommunication } from "../queues"
import type { WinbackJobData } from "../queues"

// ─── Constants ────────────────────────────────────────────────────────────────

const WINBACK_COOLDOWN_DAYS = 30
const DAILY_CAP = 200

// Tier thresholds (days since last order)
const TIER_A_MIN = 31
const TIER_A_MAX = 90
const TIER_B_MIN = 91
const TIER_B_MAX = 180

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSinceLastOrder(lastOrderAt: Date | null): number {
  return lastOrderAt
    ? Math.floor((Date.now() - lastOrderAt.getTime()) / 86_400_000)
    : 999
}

function buildTierAMessage(name: string): string {
  const firstName = name.split(" ")[0]
  return (
    `We miss you, ${firstName}! 👋 It's been a while since your last order. ` +
    `Come back and save 10% on your next order — no code needed, just for you.`
  )
}

function buildTierBMessage(
  name: string,
  daysSince: number,
  avgOrderValue: number
): string {
  const firstName = name.split(" ")[0]
  const months = Math.floor(daysSince / 30)
  const discount = Math.round(avgOrderValue * 0.15)
  const minOrder = Math.round(avgOrderValue * 0.8)
  return (
    `${firstName}, we haven't seen you in ${months} months. ` +
    `Here's something special — ₹${discount} off your next order (min ₹${minOrder}). ` +
    `Valid for 7 days.`
  )
}

// ─── Per-shop Processing ──────────────────────────────────────────────────────

async function processShop(shopId: string): Promise<{ sent: number; skipped: number }> {
  // Check WhatsApp config
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      aiSensyApiKey: true,
      watiApiToken: true,
      waAccessToken: true,
    },
  })

  if (!shop) {
    console.warn(`[winback] Shop ${shopId} not found — skipping`)
    return { sent: 0, skipped: 0 }
  }

  const hasWaConfig =
    Boolean(shop.aiSensyApiKey) ||
    Boolean(shop.watiApiToken) ||
    Boolean(shop.waAccessToken)

  if (!hasWaConfig) {
    console.log(`[winback] Shop ${shopId} has no WhatsApp config — skipping`)
    return { sent: 0, skipped: 0 }
  }

  // Check daily cap: count winback communications sent today for this shop
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const dailyCount = await db.communication.count({
    where: {
      shopId,
      triggerType: { startsWith: "winback" },
      createdAt: { gte: todayStart },
    },
  })

  if (dailyCount >= DAILY_CAP) {
    console.log(`[winback] Shop ${shopId} hit daily cap (${dailyCount}/${DAILY_CAP}) — skipping`)
    return { sent: 0, skipped: 0 }
  }

  const remaining = DAILY_CAP - dailyCount
  const now = new Date()
  const cooldownCutoff = new Date(now.getTime() - WINBACK_COOLDOWN_DAYS * 86_400_000)

  // Find eligible customers
  const candidates = await db.customer.findMany({
    where: {
      shopId,
      lifecycleStage: { in: ["lapsed", "churned"] },
      phone: { not: null },
      OR: [
        { nextActionAt: null },
        { nextActionAt: { lte: now } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      averageOrderValue: true,
      lastOrderAt: true,
      lifecycleStage: true,
      nextActionAt: true,
    },
    take: remaining,
  })

  // Filter out customers who received a winback in the last 30 days
  // by checking their last winback communication
  const candidateIds = candidates.map((c) => c.id)

  const recentWinbacks = await db.communication.findMany({
    where: {
      shopId,
      customerId: { in: candidateIds },
      triggerType: { startsWith: "winback" },
      createdAt: { gte: cooldownCutoff },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  })

  const recentWinbackSet = new Set(recentWinbacks.map((c) => c.customerId))

  let sent = 0
  let skipped = 0

  for (const customer of candidates) {
    // Skip if recently contacted
    if (recentWinbackSet.has(customer.id)) {
      skipped++
      continue
    }

    const daysSince = daysSinceLastOrder(customer.lastOrderAt)

    // Tier C — deep churn (180+ days): don't send, schedule recheck in 90 days
    if (daysSince > TIER_B_MAX) {
      await db.customer.update({
        where: { id: customer.id },
        data: { nextActionAt: new Date(Date.now() + 90 * 86_400_000) },
      })
      skipped++
      continue
    }

    let message: string
    let triggerType: string

    if (daysSince >= TIER_A_MIN && daysSince <= TIER_A_MAX) {
      // Tier A — lapsed (31–90 days)
      message = buildTierAMessage(customer.name ?? "there")
      triggerType = "winback_tier_a"
    } else if (daysSince >= TIER_B_MIN && daysSince <= TIER_B_MAX) {
      // Tier B — churned (91–180 days)
      message = buildTierBMessage(
        customer.name ?? "there",
        daysSince,
        customer.averageOrderValue ?? 500
      )
      triggerType = "winback_tier_b"
    } else {
      // daysSince < TIER_A_MIN — shouldn't appear given lifecycleStage filter, but guard anyway
      skipped++
      continue
    }

    try {
      await queueCommunication({
        shopId,
        customerId: customer.id,
        phone: customer.phone!,
        channel: "whatsapp",
        body: message,
        triggerType,
        triggerRef: customer.id,
        priority: "low",
      })

      // Push nextActionAt 30 days out to avoid re-sending too soon
      await db.customer.update({
        where: { id: customer.id },
        data: { nextActionAt: new Date(Date.now() + WINBACK_COOLDOWN_DAYS * 86_400_000) },
      })

      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[winback] ✗ Customer ${customer.id} — ${msg}`)
      skipped++
    }
  }

  console.log(`[winback] Shop ${shopId} — sent: ${sent}, skipped: ${skipped}`)
  return { sent, skipped }
}

// ─── Job Handler ──────────────────────────────────────────────────────────────

async function processWinbackJob(job: Job<WinbackJobData>) {
  const { shopId } = job.data

  // Per-shop mode
  if (shopId) {
    const result = await processShop(shopId)
    return { processed: result.sent, skipped: result.skipped }
  }

  // Sweep mode — process all active shops
  const shops = await db.shop.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  job.log(`[winback] Sweep — ${shops.length} active shops`)

  let totalSent = 0
  let totalSkipped = 0

  for (const shop of shops) {
    try {
      const result = await processShop(shop.id)
      totalSent += result.sent
      totalSkipped += result.skipped
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[winback] ✗ Shop ${shop.id} — ${msg}`)
    }
  }

  console.log(
    `[winback] Sweep complete — sent: ${totalSent}, skipped/failed: ${totalSkipped}`
  )
  return { processed: totalSent, skipped: totalSkipped }
}

// ─── Worker Export ────────────────────────────────────────────────────────────

export function startWinbackWorker(): Worker {
  const worker = new Worker<WinbackJobData>(
    "winback",
    processWinbackJob,
    {
      connection: createRedisConnection(),
      concurrency: 2,
    }
  )

  worker.on("completed", (job, result) => {
    console.log(`[winback] ✓ job ${job.id} — sent: ${result.processed}, skipped: ${result.skipped}`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[winback] ✗ job ${job?.id} — ${err.message}`)
  })

  return worker
}
