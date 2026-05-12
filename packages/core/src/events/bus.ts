import type { AppEvent, EventType } from "@d2c/shared"

// Redis/BullMQ is Phase 3. For now events are fire-and-forget in-process.
// When REDIS_URL is set, we'll upgrade to BullMQ queues automatically.

let bullmq: typeof import("bullmq") | null = null
let connection: import("ioredis").Redis | null = null

async function getBullMQ() {
  if (!process.env.REDIS_URL || process.env.REDIS_URL === "") return null
  if (bullmq) return bullmq
  try {
    const IORedis = (await import("ioredis")).default
    connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      connectTimeout: 3000,
    })
    bullmq = await import("bullmq")
    return bullmq
  } catch {
    return null
  }
}

// Routing table: which queues care about which events
const eventRoutes: Record<EventType, string[]> = {
  "checkout.started":              ["identity", "marketing"],
  "checkout.identity_captured":    ["identity", "marketing"],
  "checkout.abandoned":            ["communication", "marketing"],
  "checkout.completed":            ["identity"],
  "checkout.payment_failed":       ["communication"],
  "order.placed":                  ["order", "communication", "marketing", "retention"],
  "order.confirmed":               ["communication"],
  "order.packed":                  ["communication"],
  "order.cancelled":               ["retention"],
  "order.upsell_shown":            ["order"],
  "order.upsell_converted":        ["order", "marketing"],
  "shipment.created":              ["shipping", "communication"],
  "shipment.in_transit":           ["shipping"],
  "shipment.out_for_delivery":     ["shipping", "communication"],
  "shipment.delivered":            ["shipping", "communication", "retention", "marketing"],
  "shipment.failed_delivery":      ["shipping", "communication"],
  "shipment.stuck":                ["shipping", "communication"],
  "shipment.rto_initiated":        ["shipping", "communication"],
  "support.ticket_opened":         ["support"],
  "support.ticket_resolved":       ["support", "communication"],
  "support.escalated":             ["support"],
  "retention.churn_risk_detected": ["retention", "communication"],
  "retention.win_back_triggered":  ["communication"],
  "retention.vip_identified":      ["retention", "communication"],
  "communication.sent":            ["identity"],
  "communication.delivered":       ["identity"],
  "communication.opened":          ["identity"],
  "communication.replied":         ["support"],
  "marketing.capi_fired":          [],
}

// In-memory handlers for Phase 1/2 (no Redis needed)
const inMemoryHandlers: Map<string, Array<(event: AppEvent) => Promise<void>>> = new Map()

export function registerHandler(
  queueName: string,
  handler: (event: AppEvent) => Promise<void>
) {
  const existing = inMemoryHandlers.get(queueName) ?? []
  inMemoryHandlers.set(queueName, [...existing, handler])
}

// Publish an event — fans out to all relevant queues
// Uses BullMQ if Redis is available, falls back to in-process handlers
export async function publishEvent(event: AppEvent): Promise<void> {
  const targets = eventRoutes[event.eventType] ?? []
  if (targets.length === 0) return

  const mq = await getBullMQ()

  if (mq && connection) {
    // BullMQ path (Phase 3+)
    await Promise.all(
      targets.map((queueName) => {
        const queue = new mq!.Queue(`${queueName}-os`, { connection: connection! })
        return queue.add(event.eventType, event, {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 500 },
        })
      })
    )
  } else {
    // In-process path (Phase 1/2) — fire and forget
    for (const queueName of targets) {
      const handlers = inMemoryHandlers.get(queueName) ?? []
      for (const handler of handlers) {
        handler(event).catch((err) =>
          console.error(`[event-bus] handler error for ${queueName}:`, err)
        )
      }
    }
  }
}

export { connection }
