import { Worker, type Job } from "bullmq"
import { db } from "@d2c/database"
import { createRedisConnection, getRedis } from "../redis"
import { queueCommunication } from "../queues"
import type { AbandonedJobData } from "../queues"
import {
  getCustomerMemory,
  decideAbandonedCart,
  generateMessage,
  CalendarAgent,
  markStaleAsIgnored,
} from "../../agents"

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RECOVERY_ATTEMPTS = 3
const MIN_CART_VALUE_FINAL_NUDGE = 500

// Timing windows for each attempt (in ms)
const ATTEMPT_DELAY = {
  0: 30 * 60 * 1000,        // 30 min after abandonedAt
  1: 4 * 60 * 60 * 1000,   // 4hr after first recoverySentAt
  2: 24 * 60 * 60 * 1000,  // 24hr after first recoverySentAt
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  title: string
  quantity: number
  price: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildItemSummary(cartItems: unknown): string {
  const items = (Array.isArray(cartItems) ? cartItems : []) as OrderItem[]
  if (items.length === 0) return "your items"

  const displayed = items.slice(0, 2).map((item) => {
    const qty = item.quantity > 1 ? ` (×${item.quantity})` : ""
    return `${item.title}${qty}`
  })

  const summary = displayed.join(", ")
  const remaining = items.length - 2
  return remaining > 0 ? `${summary} & ${remaining} more` : summary
}

function buildRecoveryLink(shopDomain: string, shopifyCheckoutToken: string): string {
  return `https://${shopDomain}/checkout/${shopifyCheckoutToken}`
}

function isEligibleForAttempt(session: {
  recoveryAttempts: number
  abandonedAt: Date | null
  recoverySentAt: Date | null
}): boolean {
  const now = Date.now()
  const attempt = session.recoveryAttempts

  if (attempt === 0) {
    if (!session.abandonedAt) return false
    return now >= session.abandonedAt.getTime() + ATTEMPT_DELAY[0]
  }

  if (attempt === 1 || attempt === 2) {
    if (!session.recoverySentAt) return false
    const delayKey = attempt as 1 | 2
    return now >= session.recoverySentAt.getTime() + ATTEMPT_DELAY[delayKey]
  }

  return false
}

// ─── Core Processing ──────────────────────────────────────────────────────────

async function processSession(sessionId: string): Promise<void> {
  const session = await db.checkoutSession.findUnique({
    where: { id: sessionId },
    include: {
      shop: {
        select: {
          id: true,
          domain: true,
          name: true,
          aiSensyApiKey: true,
          watiApiToken: true,
          waAccessToken: true,
        },
      },
      customer: {
        select: { id: true },
      },
    },
  })

  if (!session) {
    console.warn(`[abandoned] Session ${sessionId} not found — skipping`)
    return
  }

  const { shop } = session

  // Skip if shop has no WhatsApp config at all
  const hasWaConfig =
    Boolean(shop.aiSensyApiKey) ||
    Boolean(shop.watiApiToken) ||
    Boolean(shop.waAccessToken)

  if (!hasWaConfig) {
    console.log(`[abandoned] Shop ${shop.id} has no WhatsApp config — skipping session ${sessionId}`)
    return
  }

  if (!session.phone) {
    console.log(`[abandoned] Session ${sessionId} has no phone — skipping`)
    return
  }

  const attempt = session.recoveryAttempts

  // Enforce min cart value for final nudge
  if (attempt === 2 && session.cartValue < MIN_CART_VALUE_FINAL_NUDGE) {
    console.log(
      `[abandoned] Session ${sessionId} cartValue ₹${session.cartValue} below ₹${MIN_CART_VALUE_FINAL_NUDGE} threshold for attempt 2 — skipping`
    )
    return
  }

  const customerId = session.customerId ?? session.customer?.id
  if (!customerId) {
    console.log(`[abandoned] Session ${sessionId} has no customerId — skipping`)
    return
  }

  // ── Agent Layer ────────────────────────────────────────────────────────────

  // 1. Load CustomerMemory — full context about this customer
  const memory = await getCustomerMemory(customerId)

  // 2. Mark stale comms as ignored before evaluating history
  await markStaleAsIgnored(customerId)

  // 3. Calendar check — ensure we're allowed to message this customer
  const calendar = new CalendarAgent(getRedis())
  const calendarCheck = await calendar.canSend(customerId, "abandoned_cart")

  if (!calendarCheck.allowed) {
    console.log(
      `[abandoned] Session ${sessionId} — calendar blocked: ${calendarCheck.reason}. ` +
      `Retry after: ${calendarCheck.retryAfter?.toISOString() ?? "unknown"}`
    )
    // Do not increment recoveryAttempts — this send didn't happen
    return
  }

  // 4. Decision Agent — should we send, and how?
  const itemSummary = buildItemSummary(session.cartItems)
  const decision = await decideAbandonedCart(memory, {
    value: session.cartValue,
    itemSummary,
    recoveryAttempts: attempt,
    abandonedAt: session.abandonedAt ?? new Date(),
  })

  console.log(`[abandoned] Session ${sessionId} — decision: ${decision.action} (${decision.reasoning})`)

  if (decision.action === "skip" || decision.action === "escalate_human") {
    if (decision.action === "escalate_human") {
      console.log(`[abandoned] Session ${sessionId} — escalating to human (VIP customer)`)
    }
    return
  }

  if (decision.action === "wait_2h" || decision.action === "wait_until_morning") {
    // Return without incrementing — the sweep will pick this up again
    console.log(`[abandoned] Session ${sessionId} — waiting: ${decision.action}`)
    return
  }

  // 5. Communication Agent — generate personalised message
  const recoveryLink = buildRecoveryLink(shop.domain, session.shopifyCheckoutToken)
  const touchIntent = `cart_recovery_touch${decision.touchNumber}` as
    | "cart_recovery_touch1"
    | "cart_recovery_touch2"
    | "cart_recovery_touch3"

  const comm = await generateMessage({
    intent: touchIntent,
    customerMemory: memory,
    brandVoice: {
      name: shop.name ?? "our store",
      tone: "friendly",
    },
    context: {
      cartValue: session.cartValue,
      itemSummary,
      recoveryLink,
      ...(decision.offerDiscount && decision.discountPercent > 0
        ? { discountPercent: decision.discountPercent }
        : {}),
    },
    constraints: {
      maxLength: 300,
      noDiscount: !decision.offerDiscount,
    },
  })

  // 6. Queue the communication with outcomeRef stored in body metadata
  await queueCommunication({
    shopId: shop.id,
    customerId,
    phone: session.phone,
    channel: "whatsapp",
    body: comm.message,
    triggerType: "abandoned_cart",
    triggerRef: session.id,
    priority: "medium",
  })

  // 7. Store outcomeRef on a Communication record so we can close the loop later.
  // The communication.worker will create the Communication record; we update it
  // here using the triggerRef so the outcomeRef is available for tracking.
  // We do a soft upsert — if not yet created, we'll patch it after the fact.
  await db.communication.updateMany({
    where: {
      customerId,
      triggerRef: session.id,
      triggerType: "abandoned_cart",
      outcomeRef: null,
    },
    data: { outcomeRef: comm.outcomeRef },
  })

  // 8. Calendar: record that we sent
  await calendar.recordSent(customerId, "abandoned_cart")

  // 9. Update recovery tracking on the session
  const now = new Date()
  await db.checkoutSession.update({
    where: { id: session.id },
    data: {
      recoveryAttempts: { increment: 1 },
      // Only set recoverySentAt on the very first send
      ...(attempt === 0 ? { recoverySentAt: now } : {}),
      updatedAt: now,
    },
  })

  console.log(
    `[abandoned] ✓ Session ${sessionId} — touch ${decision.touchNumber}/${MAX_RECOVERY_ATTEMPTS} queued for ${session.phone} | outcomeRef: ${comm.outcomeRef}`
  )
}

// ─── Job Handler ──────────────────────────────────────────────────────────────

async function processAbandonedJob(job: Job<AbandonedJobData>) {
  const { checkoutSessionId } = job.data

  // Per-session mode
  if (checkoutSessionId) {
    await processSession(checkoutSessionId)
    return { processed: 1 }
  }

  // Sweep mode — find all eligible abandoned sessions
  const now = new Date()

  // We need sessions where:
  // - status = "abandoned"
  // - recoveryAttempts < 3
  // - phone is not null
  // Timing eligibility is checked in-process since it depends on attempt number
  const candidates = await db.checkoutSession.findMany({
    where: {
      status: "abandoned",
      recoveryAttempts: { lt: MAX_RECOVERY_ATTEMPTS },
      phone: { not: null },
      OR: [
        // attempt 0: ready after abandonedAt + 30min
        {
          recoveryAttempts: 0,
          abandonedAt: { lte: new Date(now.getTime() - ATTEMPT_DELAY[0]) },
        },
        // attempt 1: ready after recoverySentAt + 4hr
        {
          recoveryAttempts: 1,
          recoverySentAt: { lte: new Date(now.getTime() - ATTEMPT_DELAY[1]) },
        },
        // attempt 2: ready after recoverySentAt + 24hr
        {
          recoveryAttempts: 2,
          recoverySentAt: { lte: new Date(now.getTime() - ATTEMPT_DELAY[2]) },
        },
      ],
    },
    select: { id: true, recoveryAttempts: true, abandonedAt: true, recoverySentAt: true },
    take: 100,
  })

  job.log(`[abandoned] Sweep found ${candidates.length} eligible sessions`)

  let processed = 0
  let skipped = 0

  for (const candidate of candidates) {
    // Double-check timing eligibility (guard against race conditions)
    if (!isEligibleForAttempt(candidate)) {
      skipped++
      continue
    }

    try {
      await processSession(candidate.id)
      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[abandoned] ✗ Session ${candidate.id} — ${msg}`)
      skipped++
    }
  }

  console.log(`[abandoned] Sweep complete — processed: ${processed}, skipped/failed: ${skipped}`)
  return { processed, skipped }
}

// ─── Worker Export ────────────────────────────────────────────────────────────

export function startAbandonedWorker(): Worker {
  const worker = new Worker<AbandonedJobData>(
    "abandoned",
    processAbandonedJob,
    {
      connection: createRedisConnection(),
      concurrency: 5,
    }
  )

  worker.on("completed", (job, result) => {
    console.log(`[abandoned] ✓ job ${job.id} — processed: ${result.processed}`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[abandoned] ✗ job ${job?.id} — ${err.message}`)
  })

  return worker
}
