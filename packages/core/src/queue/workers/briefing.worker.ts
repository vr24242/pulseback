import { Worker, type Job } from "bullmq"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@d2c/database"
import { createRedisConnection } from "../redis"
import { queueCommunication, getBriefingQueue } from "../queues"
import type { BriefingJobData } from "../queues"

// ─── Claude Client ────────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// ─── Stats ────────────────────────────────────────────────────────────────────

type BriefingStats = {
  ordersPlaced: number
  revenue: number
  codOrders: number
  cancelledOrders: number
  delivered: number
  stuck: number
  rtoInitiated: number
  newCustomers: number
}

async function pullStats(shopId: string): Promise<BriefingStats> {
  const since = new Date(Date.now() - 86_400_000) // 24h ago

  const [orders, shipments, newCustomers] = await Promise.all([
    db.order.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: { totalPrice: true, paymentMethod: true, status: true },
    }),
    db.shipment.findMany({
      where: { order: { shopId }, updatedAt: { gte: since } },
      select: { status: true, isStuck: true, rtoInitiatedAt: true },
    }),
    db.customer.count({ where: { shopId, createdAt: { gte: since } } }),
  ])

  return {
    ordersPlaced: orders.length,
    revenue: orders.reduce((s, o) => s + o.totalPrice, 0),
    codOrders: orders.filter((o) => o.paymentMethod === "cod").length,
    cancelledOrders: orders.filter((o) => o.status === "cancelled").length,
    delivered: shipments.filter((s) => s.status === "delivered").length,
    stuck: shipments.filter((s) => s.isStuck).length,
    rtoInitiated: shipments.filter((s) => s.rtoInitiatedAt !== null).length,
    newCustomers,
  }
}

// ─── Text Generation ──────────────────────────────────────────────────────────

function codPct(stats: BriefingStats): string {
  if (stats.ordersPlaced === 0) return "0"
  return Math.round((stats.codOrders / stats.ordersPlaced) * 100).toString()
}

function formatRevenue(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} crore`
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} lakh`
  return `₹${amount.toLocaleString("en-IN")}`
}

function buildPrompt(shopName: string, stats: BriefingStats): string {
  return `You are PulseOS, a D2C intelligence assistant. Write a WhatsApp briefing for a Shopify merchant.
Keep it under 200 words, conversational, no bullet points — flowing paragraph. Use Indian English.
Use ₹ for currency, format numbers in Indian lakh/crore where appropriate.
End with one actionable insight.

Shop: ${shopName}
Data for last 24 hours:
- Orders placed: ${stats.ordersPlaced}
- Revenue: ${formatRevenue(stats.revenue)}
- COD orders: ${stats.codOrders} (${codPct(stats)}%)
- Cancellations: ${stats.cancelledOrders}
- Deliveries completed: ${stats.delivered}
- Stuck shipments: ${stats.stuck}
- RTO initiated: ${stats.rtoInitiated}
- New customers: ${stats.newCustomers}`
}

function fallbackBriefing(shopName: string, stats: BriefingStats): string {
  return (
    `PulseOS Daily Briefing — ${shopName}\n\n` +
    `Here's your last 24 hours at a glance: you received ${stats.ordersPlaced} order(s) ` +
    `with total revenue of ${formatRevenue(stats.revenue)}. ` +
    `COD accounted for ${stats.codOrders} order(s) (${codPct(stats)}%). ` +
    `${stats.cancelledOrders} order(s) were cancelled. ` +
    `${stats.delivered} shipment(s) were delivered, ${stats.stuck} are stuck, ` +
    `and ${stats.rtoInitiated} RTO(s) were initiated. ` +
    `${stats.newCustomers} new customer(s) joined today. ` +
    `Keep an eye on stuck shipments — proactive follow-up can reduce RTO rates significantly.`
  )
}

async function generateBriefing(
  shopName: string,
  stats: BriefingStats
): Promise<string> {
  const client = getAnthropicClient()

  if (!client) {
    console.warn("[briefing] ANTHROPIC_API_KEY not set — using fallback template")
    return fallbackBriefing(shopName, stats)
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: buildPrompt(shopName, stats),
        },
      ],
    })

    const block = message.content[0]
    if (block.type !== "text") {
      throw new Error("Unexpected non-text response from Claude")
    }

    return block.text.trim()
  } catch (err) {
    console.error("[briefing] Claude API error — falling back to template", err)
    return fallbackBriefing(shopName, stats)
  }
}

// ─── Per-shop logic ───────────────────────────────────────────────────────────

async function processSingleShop(
  shopId: string,
  job: Job<BriefingJobData>
): Promise<{ shopId: string; sent: boolean; reason?: string }> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { id: true, name: true, ownerPhone: true, isActive: true },
  })

  if (!shop || !shop.isActive) {
    job.log(`[briefing] shop=${shopId} not found or inactive — skipping`)
    return { shopId, sent: false, reason: "inactive_or_missing" }
  }

  if (!shop.ownerPhone) {
    job.log(`[briefing] shop=${shopId} has no ownerPhone — skipping`)
    return { shopId, sent: false, reason: "no_phone" }
  }

  const stats = await pullStats(shopId)

  if (stats.ordersPlaced === 0 && stats.delivered === 0) {
    job.log(`[briefing] shop=${shopId} — nothing happened today, skipping`)
    return { shopId, sent: false, reason: "no_activity" }
  }

  job.log(
    `[briefing] shop=${shopId} orders=${stats.ordersPlaced} revenue=${stats.revenue} delivered=${stats.delivered}`
  )

  const briefingText = await generateBriefing(shop.name ?? shopId, stats)

  await queueCommunication({
    shopId,
    customerId: "system",
    phone: shop.ownerPhone,
    channel: "whatsapp",
    body: briefingText,
    triggerType: "daily_briefing",
    triggerRef: shopId,
    priority: "low",
  })

  job.log(`[briefing] shop=${shopId} briefing queued for ${shop.ownerPhone}`)
  return { shopId, sent: true }
}

// ─── Sweep fan-out ────────────────────────────────────────────────────────────

async function processSweep(job: Job<BriefingJobData>) {
  const shops = await db.shop.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  job.log(`[briefing] sweep — enqueuing ${shops.length} per-shop jobs`)

  const queue = getBriefingQueue()

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i]
    await queue.add(
      "briefing",
      { shopId: shop.id },
      {
        jobId: `briefing:${shop.id}:${Date.now()}`,
        delay: i * 500, // 500ms stagger
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    )
  }

  return { swept: true, shopCount: shops.length }
}

// ─── Job Handler ──────────────────────────────────────────────────────────────

async function processBriefingJob(job: Job<BriefingJobData>) {
  const { shopId } = job.data

  if (shopId === "all") {
    job.log("[briefing] sweep mode triggered")
    return processSweep(job)
  }

  return processSingleShop(shopId, job)
}

// ─── Worker Export ────────────────────────────────────────────────────────────

export function startBriefingWorker(): Worker {
  const worker = new Worker<BriefingJobData>("briefing", processBriefingJob, {
    connection: createRedisConnection(),
    concurrency: 3,
  })

  worker.on("completed", (job, result) => {
    const r = result as
      | { swept: true; shopCount: number }
      | { shopId: string; sent: boolean; reason?: string }

    if ("swept" in r) {
      console.log(`[briefing] ✓ sweep complete — enqueued ${r.shopCount} shops`)
    } else {
      const status = r.sent ? "sent" : `skipped (${r.reason ?? "unknown"})`
      console.log(`[briefing] ✓ job=${job.id} shop=${r.shopId} ${status}`)
    }
  })

  worker.on("failed", (job, err) => {
    console.error(`[briefing] ✗ job=${job?.id} — ${err.message}`)
  })

  return worker
}
