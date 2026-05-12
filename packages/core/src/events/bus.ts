import { Queue, Worker, Job } from "bullmq"
import IORedis from "ioredis"
import type { AppEvent, EventType } from "@d2c/shared"

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

// One queue per Sub-OS — lets each scale independently
export const queues = {
  identity:      new Queue("identity-os",      { connection }),
  communication: new Queue("communication-os", { connection }),
  order:         new Queue("order-os",         { connection }),
  shipping:      new Queue("shipping-os",      { connection }),
  support:       new Queue("support-os",       { connection }),
  retention:     new Queue("retention-os",     { connection }),
  marketing:     new Queue("marketing-os",     { connection }),
} as const

type QueueName = keyof typeof queues

// Routing table: which queues care about which events
const eventRoutes: Record<EventType, QueueName[]> = {
  "checkout.started":             ["identity", "marketing"],
  "checkout.identity_captured":   ["identity", "marketing"],
  "checkout.abandoned":           ["communication", "marketing"],
  "checkout.completed":           ["identity"],
  "checkout.payment_failed":      ["communication"],
  "order.placed":                 ["order", "communication", "marketing", "retention"],
  "order.confirmed":              ["communication"],
  "order.packed":                 ["communication"],
  "order.cancelled":              ["retention"],
  "order.upsell_shown":           ["order"],
  "order.upsell_converted":       ["order", "marketing"],
  "shipment.created":             ["shipping", "communication"],
  "shipment.in_transit":          ["shipping"],
  "shipment.out_for_delivery":    ["shipping", "communication"],
  "shipment.delivered":           ["shipping", "communication", "retention", "marketing"],
  "shipment.failed_delivery":     ["shipping", "communication"],
  "shipment.stuck":               ["shipping", "communication"],
  "shipment.rto_initiated":       ["shipping", "communication"],
  "support.ticket_opened":        ["support"],
  "support.ticket_resolved":      ["support", "communication"],
  "support.escalated":            ["support"],
  "retention.churn_risk_detected":["retention", "communication"],
  "retention.win_back_triggered": ["communication"],
  "retention.vip_identified":     ["retention", "communication"],
  "communication.sent":           ["identity"],
  "communication.delivered":      ["identity"],
  "communication.opened":         ["identity"],
  "communication.replied":        ["support"],
  "marketing.capi_fired":         [],
}

// Publish an event — fans out to all relevant Sub-OS queues
export async function publishEvent(event: AppEvent): Promise<void> {
  const targets = eventRoutes[event.eventType] ?? []

  await Promise.all(
    targets.map((queueName) =>
      queues[queueName].add(event.eventType, event, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      })
    )
  )
}

// Register a worker for a Sub-OS queue
export function createWorker(
  queueName: QueueName,
  processor: (job: Job<AppEvent>) => Promise<void>
): Worker {
  return new Worker(queueName + "-os", processor, {
    connection,
    concurrency: 10,
  })
}

export { connection }
