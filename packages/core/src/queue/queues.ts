import { Queue } from "bullmq"
import { createRedisConnection } from "./redis"

// ─── Job Payload Types ────────────────────────────────────────────────────────

export type CommunicationJobData = {
  shopId: string
  customerId: string
  phone: string
  channel: "whatsapp" | "sms"
  templateName?: string
  body?: string            // for free-form WhatsApp messages
  bodyParams?: string[]   // for template messages
  triggerType: string
  triggerRef?: string      // orderId, shipmentId, etc.
  priority?: "high" | "medium" | "low"
}

export type WebhookJobData = {
  topic: string            // orders/create | orders/updated | checkouts/create | etc.
  shopDomain: string
  shopifyWebhookId: string // for deduplication
  payload: unknown
}

export type TrackingJobData = {
  awb?: string             // if undefined, sweep all active shipments
  shipmentId?: string
  source?: string          // where the job came from (e.g., "shiprocket-webhook")
}

export type AbandonedJobData = {
  checkoutSessionId?: string // if undefined, sweep all abandoned sessions
}

export type NdrJobData = {
  shipmentId?: string      // if undefined, sweep all stuck shipments
}

export type RetentionJobData = {
  shopId?: string          // if undefined, process all shops
  batchIndex?: number
  batchSize?: number
}

export type BriefingJobData = {
  shopId: string
}

export type WinbackJobData = {
  shopId?: string
}

// ─── Queue Definitions ────────────────────────────────────────────────────────

const defaultJobOptions = {
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
}

function makeQueue<T>(name: string) {
  return new Queue<T>(name, {
    connection: createRedisConnection(),
    defaultJobOptions,
  })
}

// Singleton queues — created once, reused across the process
let _communicationQueue: Queue<CommunicationJobData> | null = null
let _webhookQueue: Queue<WebhookJobData> | null = null
let _trackingQueue: Queue<TrackingJobData> | null = null
let _abandonedQueue: Queue<AbandonedJobData> | null = null
let _ndrQueue: Queue<NdrJobData> | null = null
let _retentionQueue: Queue<RetentionJobData> | null = null
let _briefingQueue: Queue<BriefingJobData> | null = null
let _winbackQueue: Queue<WinbackJobData> | null = null

export function getCommunicationQueue() {
  return (_communicationQueue ??= makeQueue<CommunicationJobData>("communication"))
}
export function getWebhookQueue() {
  return (_webhookQueue ??= makeQueue<WebhookJobData>("webhook"))
}
export function getTrackingQueue() {
  return (_trackingQueue ??= makeQueue<TrackingJobData>("tracking"))
}
export function getAbandonedQueue() {
  return (_abandonedQueue ??= makeQueue<AbandonedJobData>("abandoned"))
}
export function getNdrQueue() {
  return (_ndrQueue ??= makeQueue<NdrJobData>("ndr"))
}
export function getRetentionQueue() {
  return (_retentionQueue ??= makeQueue<RetentionJobData>("retention"))
}
export function getBriefingQueue() {
  return (_briefingQueue ??= makeQueue<BriefingJobData>("briefing"))
}
export function getWinbackQueue() {
  return (_winbackQueue ??= makeQueue<WinbackJobData>("winback"))
}

// ─── Queue Helpers ────────────────────────────────────────────────────────────

const PRIORITY = { high: 1, medium: 5, low: 10 }

/**
 * Queue a WhatsApp/SMS message. Deduplication via jobId.
 * jobId format: comm:{shopId}:{customerId}:{triggerType}:{triggerRef}
 */
export async function queueCommunication(data: CommunicationJobData) {
  const jobId = [
    "comm",
    data.shopId,
    data.customerId,
    data.triggerType,
    data.triggerRef ?? "none",
  ].join(":")

  return getCommunicationQueue().add("send", data, {
    jobId,
    priority: PRIORITY[data.priority ?? "medium"],
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  })
}

/**
 * Queue a Shopify webhook for async processing.
 * jobId = Shopify webhook ID — natural deduplication against retries.
 */
export async function queueWebhook(data: WebhookJobData) {
  return getWebhookQueue().add(data.topic, data, {
    jobId: `webhook:${data.shopifyWebhookId}`,
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    priority: 1,
  })
}

/**
 * Schedule shipment tracking sweep (called by repeatable job or manually).
 */
export async function queueTracking(data: TrackingJobData = {}) {
  const jobId = data.awb ? `track:awb:${data.awb}` : `track:sweep:${Date.now()}`
  return getTrackingQueue().add("track", data, {
    jobId,
    attempts: 5,
    backoff: { type: "exponential", delay: 3000 },
  })
}

/**
 * Schedule NDR sweep or per-shipment attempt.
 */
export async function queueNdr(data: NdrJobData = {}) {
  const jobId = data.shipmentId
    ? `ndr:${data.shipmentId}:${Date.now()}`
    : `ndr:sweep:${Date.now()}`
  return getNdrQueue().add("ndr", data, {
    jobId,
    attempts: 3,
    backoff: { type: "fixed", delay: 5000 },
  })
}
