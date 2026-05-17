/**
 * finance.server.ts — Finance OS data service
 * All DB queries for the Finance dashboard live here.
 * Loaders stay thin — they call getFinanceStats() and return.
 */

import { db } from "@d2c/database"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinanceStats {
  grossRevenue: number
  codFloat: number
  codFloatOrders: number
  codFloatAvg: number
  prepaidRevenue: number
  netRevenue: number
  rtoCost: number
  rtoOrders: number
  cancellationLoss: number
  cancelledOrders: number
  returnRefunds: number
  returnCount: number
  workingCapital: number
  codOrders: number
  prepaidOrders: number
  totalOrders: number
  byCarrier: Array<{
    carrier: string
    orders: number
    revenue: number
    rtos: number
    rtoCost: number
    rtoRate: number
  }>
  dailyRevenue: Array<{ date: string; revenue: number; orders: number }>
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function getFinanceStats(shopId: string, rangeDays: number): Promise<FinanceStats> {
  const since = new Date(Date.now() - rangeDays * 86_400_000)

  const [orders, returns, shipments] = await Promise.all([
    db.order.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: {
        totalPrice: true,
        paymentMethod: true,
        paymentStatus: true,
        status: true,
        isRTO: true,
        rtoCost: true,
        createdAt: true,
        cancelledAt: true,
      },
    }),
    db.returnRequest.findMany({
      where: {
        shopId,
        status: { in: ["processed", "refunded"] },
        createdAt: { gte: since },
      },
      select: { refundAmount: true },
    }),
    db.shipment.findMany({
      where: { order: { shopId, createdAt: { gte: since } } },
      select: {
        carrier: true,
        order: {
          select: {
            totalPrice: true,
            isRTO: true,
            rtoCost: true,
          },
        },
      },
    }),
  ])

  // ── Revenue metrics ────────────────────────────────────────────────────────

  const nonCancelledOrders = orders.filter(o => o.status !== "cancelled")

  const grossRevenue = nonCancelledOrders.reduce((sum, o) => sum + o.totalPrice, 0)

  const codFloatOrders = orders.filter(
    o => o.paymentMethod === "cod" && o.paymentStatus !== "paid" && o.status !== "cancelled",
  )
  const codFloat = codFloatOrders.reduce((sum, o) => sum + o.totalPrice, 0)
  const codFloatAvg = codFloatOrders.length > 0 ? codFloat / codFloatOrders.length : 0

  const prepaidOrders = nonCancelledOrders.filter(o => o.paymentMethod !== "cod")
  const prepaidRevenue = prepaidOrders.reduce((sum, o) => sum + o.totalPrice, 0)

  // ── Loss metrics ──────────────────────────────────────────────────────────

  const rtoOrders = orders.filter(o => o.isRTO)
  const rtoCost = rtoOrders.reduce((sum, o) => sum + (o.rtoCost ?? 0), 0)

  const cancelledOrders = orders.filter(o => o.status === "cancelled")
  const cancellationLoss = cancelledOrders.reduce((sum, o) => sum + o.totalPrice, 0)

  const returnRefunds = returns.reduce((sum, r) => sum + r.refundAmount, 0)
  const returnCount = returns.length

  // ── Derived ───────────────────────────────────────────────────────────────

  const netRevenue = grossRevenue - rtoCost
  const workingCapital = prepaidRevenue - rtoCost - returnRefunds

  // ── COD vs Prepaid totals (all non-cancelled) ─────────────────────────────

  const codOrdersCount = nonCancelledOrders.filter(o => o.paymentMethod === "cod").length
  const prepaidOrdersCount = prepaidOrders.length
  const totalOrders = nonCancelledOrders.length

  // ── By carrier ────────────────────────────────────────────────────────────

  const carrierMap = new Map<string, { carrier: string; orders: number; revenue: number; rtos: number; rtoCost: number }>()
  for (const s of shipments) {
    const c = s.carrier || "unknown"
    if (!carrierMap.has(c)) {
      carrierMap.set(c, { carrier: c, orders: 0, revenue: 0, rtos: 0, rtoCost: 0 })
    }
    const entry = carrierMap.get(c)!
    entry.orders++
    entry.revenue += s.order.totalPrice
    if (s.order.isRTO) {
      entry.rtos++
      entry.rtoCost += s.order.rtoCost ?? 0
    }
  }

  const byCarrier = Array.from(carrierMap.values())
    .map(c => ({
      ...c,
      rtoRate: c.orders > 0 ? Math.round((c.rtos / c.orders) * 100) : 0,
    }))
    .sort((a, b) => b.orders - a.orders)

  // ── Daily revenue (fill gaps) ────────────────────────────────────────────

  const dayCount = Math.min(rangeDays, 30) // cap at 30 bars for readability
  const dayRevMap = new Map<string, { revenue: number; orders: number }>()

  // Seed all days with 0 so gaps appear
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    dayRevMap.set(key, { revenue: 0, orders: 0 })
  }

  for (const o of nonCancelledOrders) {
    const key = o.createdAt.toISOString().slice(0, 10)
    if (dayRevMap.has(key)) {
      const entry = dayRevMap.get(key)!
      entry.revenue += o.totalPrice
      entry.orders++
    }
  }

  const dailyRevenue = Array.from(dayRevMap.entries()).map(([date, v]) => ({ date, ...v }))

  return {
    grossRevenue,
    codFloat,
    codFloatOrders: codFloatOrders.length,
    codFloatAvg,
    prepaidRevenue,
    netRevenue,
    rtoCost,
    rtoOrders: rtoOrders.length,
    cancellationLoss,
    cancelledOrders: cancelledOrders.length,
    returnRefunds,
    returnCount,
    workingCapital,
    codOrders: codOrdersCount,
    prepaidOrders: prepaidOrdersCount,
    totalOrders,
    byCarrier,
    dailyRevenue,
  }
}
