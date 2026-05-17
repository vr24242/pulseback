/**
 * ndr.server.ts — NDR data service
 * All DB queries for the NDR dashboard live here.
 * Loaders stay thin — they call these functions and return.
 */

import { db } from "@d2c/database"

const NDR_PAGE_SIZE = 20

// ─── Shared types ─────────────────────────────────────────────────────────────

export type NdrFilter = "stuck" | "rto" | "all"

export interface NdrShipment {
  id: string
  awb: string
  carrier: string
  status: string
  rawStatus: string | null
  isStuck: boolean
  stuckSince: string | null
  failedAttempts: number
  lastFailedAt: string | null
  ndrAttempts: number
  lastNdrAt: string | null
  rtoInitiatedAt: string | null
  createdAt: string
  order: {
    id: string
    shopifyOrderName: string
    totalPrice: number
    paymentMethod: string
    shippingAddress: Record<string, string> | null
    customer: { name: string; phone: string | null } | null
  }
}

export interface NdrStats {
  totalStuck: number
  totalRtoRisk: number
  totalResolved: number
  avgAttemptsBeforeResolution: number
  resolutionRate: number            // % of stuck that got delivered
  byCarrier: Array<{
    carrier: string
    stuck: number
    rto: number
    resolved: number
  }>
  byFailedAttempts: Array<{ label: string; count: number }>
}

// ─── Queries ──────────────────────────────────────────────────────────────────

function buildWhere(shopId: string, filter: NdrFilter) {
  const base = { order: { shopId } }
  if (filter === "stuck")  return { ...base, isStuck: true, rtoInitiatedAt: null }
  if (filter === "rto")    return { ...base, rtoInitiatedAt: { not: null } }
  return { ...base, failedAttempts: { gt: 0 } }
}

export async function getNdrStats(shopId: string): Promise<NdrStats> {
  const [stuckCount, rtoCount, allFailed] = await Promise.all([
    db.shipment.count({ where: { order: { shopId }, isStuck: true, rtoInitiatedAt: null } }),
    db.shipment.count({ where: { order: { shopId }, rtoInitiatedAt: { not: null } } }),
    db.shipment.findMany({
      where: { order: { shopId }, failedAttempts: { gt: 0 } },
      select: { carrier: true, isStuck: true, rtoInitiatedAt: true, failedAttempts: true, status: true, ndrAttempts: true },
    }),
  ])

  const resolved = allFailed.filter(s => s.status === "delivered")
  const resolvedWithNdr = resolved.filter(s => s.ndrAttempts > 0)
  const avgAttempts = resolvedWithNdr.length > 0
    ? resolvedWithNdr.reduce((sum, s) => sum + s.ndrAttempts, 0) / resolvedWithNdr.length
    : 0

  const totalAttempted = stuckCount + resolved.length
  const resolutionRate = totalAttempted > 0
    ? Math.round((resolved.length / totalAttempted) * 100)
    : 0

  // Per-carrier breakdown
  const carrierMap = new Map<string, { stuck: number; rto: number; resolved: number }>()
  for (const s of allFailed) {
    const c = s.carrier
    if (!carrierMap.has(c)) carrierMap.set(c, { stuck: 0, rto: 0, resolved: 0 })
    const entry = carrierMap.get(c)!
    if (s.isStuck) entry.stuck++
    if (s.rtoInitiatedAt) entry.rto++
    if (s.status === "delivered") entry.resolved++
  }

  const byCarrier = Array.from(carrierMap.entries())
    .map(([carrier, counts]) => ({ carrier, ...counts }))
    .sort((a, b) => (b.stuck + b.rto) - (a.stuck + a.rto))

  // Failed attempts distribution
  const attemptBuckets = new Map([["1", 0], ["2", 0], ["3+", 0]])
  for (const s of allFailed) {
    const key = s.failedAttempts >= 3 ? "3+" : String(s.failedAttempts)
    attemptBuckets.set(key, (attemptBuckets.get(key) ?? 0) + 1)
  }
  const byFailedAttempts = Array.from(attemptBuckets.entries()).map(([label, count]) => ({ label, count }))

  return {
    totalStuck: stuckCount,
    totalRtoRisk: rtoCount,
    totalResolved: resolved.length,
    avgAttemptsBeforeResolution: Math.round(avgAttempts * 10) / 10,
    resolutionRate,
    byCarrier,
    byFailedAttempts,
  }
}

export async function getNdrShipments(
  shopId: string,
  filter: NdrFilter,
  page: number,
): Promise<{ shipments: NdrShipment[]; total: number }> {
  const where = buildWhere(shopId, filter)

  const [total, raw] = await Promise.all([
    db.shipment.count({ where }),
    db.shipment.findMany({
      where,
      orderBy: [{ failedAttempts: "desc" }, { stuckSince: "asc" }],
      skip: (page - 1) * NDR_PAGE_SIZE,
      take: NDR_PAGE_SIZE,
      include: {
        order: {
          select: {
            id: true,
            shopifyOrderName: true,
            totalPrice: true,
            paymentMethod: true,
            shippingAddress: true,
            customer: { select: { name: true, phone: true } },
          },
        },
      },
    }),
  ])

  const shipments = raw.map(s => ({
    id: s.id,
    awb: s.awb,
    carrier: s.carrier,
    status: s.status,
    rawStatus: s.rawStatus,
    isStuck: s.isStuck,
    stuckSince: s.stuckSince?.toISOString() ?? null,
    failedAttempts: s.failedAttempts,
    lastFailedAt: s.lastFailedAt?.toISOString() ?? null,
    ndrAttempts: s.ndrAttempts,
    lastNdrAt: s.lastNdrAt?.toISOString() ?? null,
    rtoInitiatedAt: s.rtoInitiatedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    order: {
      id: s.order.id,
      shopifyOrderName: s.order.shopifyOrderName,
      totalPrice: s.order.totalPrice,
      paymentMethod: s.order.paymentMethod,
      shippingAddress: s.order.shippingAddress as Record<string, string> | null,
      customer: s.order.customer ?? null,
    },
  }))

  return { shipments: shipments as NdrShipment[], total }
}
