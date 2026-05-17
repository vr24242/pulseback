/**
 * marketing.server.ts — Marketing OS data service
 *
 * Customer segmentation + broadcast queuing.
 * Segments are derived from Customer fields already computed by retention.worker.
 * Broadcasts queue via communication worker — no new model needed.
 * Campaign history is read from Communications (triggerType LIKE "broadcast_%").
 */

import { db } from "@d2c/database"
import { queueCommunication } from "@d2c/core/queue"

const BROADCAST_CAP_INTERNAL = 500

export type SegmentKey =
  | "champions"
  | "at_risk"
  | "lapsed_highvalue"
  | "new_second_push"
  | "cod_habitual"
  | "churned"
  | "all_active"

// ─── Segment queries ──────────────────────────────────────────────────────────

// Keys only — labels/descriptions live in the route (client-safe)
const SEGMENTS: Array<{ key: SegmentKey }> = [
  { key: "champions" },
  { key: "at_risk" },
  { key: "lapsed_highvalue" },
  { key: "new_second_push" },
  { key: "cod_habitual" },
  { key: "churned" },
  { key: "all_active" },
]

function buildSegmentWhere(shopId: string, segment: SegmentKey) {
  const base = { shopId, phone: { not: null } }

  switch (segment) {
    case "champions":
      return { ...base, lifecycleStage: "champion" }
    case "at_risk":
      return { ...base, lifecycleStage: "at_risk" }
    case "lapsed_highvalue":
      return { ...base, lifecycleStage: "lapsed", ltvTier: { in: ["high", "vip"] } }
    case "new_second_push":
      return { ...base, lifecycleStage: "active", totalOrders: 1 }
    case "churned":
      return { ...base, lifecycleStage: "churned" }
    case "all_active":
      return { ...base, lifecycleStage: { in: ["active", "champion"] } }
    case "cod_habitual":
      // Customers who exist and have orders — we'll filter COD in memory
      // since paymentMethod is on Order not Customer
      return { ...base }
    default:
      return base
  }
}

export async function getSegmentCount(shopId: string, segment: SegmentKey): Promise<number> {
  if (segment === "cod_habitual") {
    // Count customers whose most recent order is COD
    const since30d = new Date(Date.now() - 30 * 86_400_000)
    return db.order.groupBy({
      by: ["customerId"],
      where: { shopId, paymentMethod: "cod", createdAt: { gte: since30d }, customerId: { not: null } },
    }).then(r => r.length)
  }
  return db.customer.count({ where: buildSegmentWhere(shopId, segment) })
}

export async function getSegmentCounts(shopId: string): Promise<Record<SegmentKey, number>> {
  const counts = await Promise.all(
    SEGMENTS.map(s => getSegmentCount(shopId, s.key).then(n => [s.key, n] as const))
  )
  return Object.fromEntries(counts) as Record<SegmentKey, number>
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

export async function sendBroadcast(
  shopId: string,
  segment: SegmentKey,
  message: string,
): Promise<{ queued: number; campaignId: string }> {
  const campaignId = `broadcast_${Date.now()}`

  let customers: Array<{ id: string; phone: string | null }>

  if (segment === "cod_habitual") {
    const since30d = new Date(Date.now() - 30 * 86_400_000)
    const orders = await db.order.findMany({
      where: { shopId, paymentMethod: "cod", createdAt: { gte: since30d }, customerId: { not: null } },
      select: { customerId: true },
      distinct: ["customerId"],
      take: BROADCAST_CAP_INTERNAL,
    })
    const ids = orders.map(o => o.customerId!).filter(Boolean)
    customers = await db.customer.findMany({
      where: { id: { in: ids }, phone: { not: null } },
      select: { id: true, phone: true },
    })
  } else {
    customers = await db.customer.findMany({
      where: buildSegmentWhere(shopId, segment),
      select: { id: true, phone: true },
      take: BROADCAST_CAP_INTERNAL,
    })
  }

  const eligible = customers.filter(c => c.phone)

  // Queue all — communication worker handles quiet hours + frequency cap
  await Promise.all(
    eligible.map(c =>
      queueCommunication({
        shopId,
        customerId: c.id,
        phone: c.phone!,
        channel: "whatsapp",
        body: message,
        triggerType: campaignId,
        priority: "low",    // never blocks transactional
      })
    )
  )

  return { queued: eligible.length, campaignId }
}

// ─── Campaign history ─────────────────────────────────────────────────────────

export interface Campaign {
  campaignId: string
  sentAt: string
  count: number
  segment: string  // derived from campaignId prefix not available, so we store it
}

export async function getRecentCampaigns(shopId: string): Promise<Campaign[]> {
  // Group by triggerType (which is the campaignId for broadcasts)
  const comms = await db.communication.findMany({
    where: { shopId, triggerType: { startsWith: "broadcast_" } },
    select: { triggerType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 2000,  // enough to see last ~10 broadcasts of 200 each
  })

  const grouped = new Map<string, { count: number; date: Date }>()
  for (const c of comms) {
    const key = c.triggerType ?? ""
    if (!grouped.has(key)) grouped.set(key, { count: 0, date: c.createdAt })
    grouped.get(key)!.count++
  }

  return Array.from(grouped.entries())
    .sort((a, b) => b[1].date.getTime() - a[1].date.getTime())
    .slice(0, 10)
    .map(([id, { count, date }]) => ({
      campaignId: id,
      sentAt: date.toISOString(),
      count,
      segment: "broadcast",
    }))
}
