import { db } from "@d2c/database"

export interface CODFloatStatus {
  totalCODOutstanding: number
  orderCount: number
  avgDaysOutstanding: number
  overdueCount: number
  alertThreshold: number
  isAlert: boolean
}

export interface ROASData {
  grossRevenue: number
  attributedOrders: number
  rtoRate: number
  netRevenue: number
  realizedROAS: number
}

/**
 * Monitor COD float: track amount of money stuck in courier hands
 */
export async function getCODFloatStatus(shopId: string): Promise<CODFloatStatus> {
  const now = new Date()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const codOrders = await db.order.findMany({
    where: {
      shopId,
      paymentMethod: "cod",
      isRTO: false,
      status: { in: ["placed", "confirmed", "packed", "dispatched"] },
    },
    select: {
      id: true,
      totalPrice: true,
      createdAt: true,
    },
  })

  const totalCODOutstanding = codOrders.reduce((sum, o) => sum + o.totalPrice, 0)
  const overdueCount = codOrders.filter((o) => o.createdAt < threeDaysAgo).length

  const avgDaysOutstanding =
    codOrders.length > 0
      ? codOrders.reduce((sum, o) => sum + (now.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24), 0) /
          codOrders.length
      : 0

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { codFloatAlert: true } })
  const alertThreshold = shop?.codFloatAlert || 50000

  return {
    totalCODOutstanding,
    orderCount: codOrders.length,
    avgDaysOutstanding,
    overdueCount,
    alertThreshold,
    isAlert: totalCODOutstanding > alertThreshold,
  }
}

/**
 * Calculate true ROAS: ad spend → attributed orders → net revenue
 */
export async function calculateROAS(
  shopId: string,
  lookbackDays: number = 30,
): Promise<ROASData> {
  const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)

  // Orders from lookback window
  const orders = await db.order.findMany({
    where: {
      shopId,
      createdAt: { gte: startDate },
    },
  })

  const attributedOrders = orders.length
  const grossRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0)

  let totalPaymentFees = 0
  let rtoCount = 0

  // Calculate costs
  orders.forEach((order) => {
    // Assume 2.5% payment fee on prepaid (Razorpay), 0% on COD
    if (order.paymentMethod === "prepaid") {
      totalPaymentFees += order.totalPrice * 0.025
    }

    if (order.isRTO) {
      rtoCount++
    }
  })

  const rtoRate = attributedOrders > 0 ? rtoCount / attributedOrders : 0
  const netRevenue = grossRevenue - totalPaymentFees
  const realizedROAS = grossRevenue > 0 ? netRevenue / grossRevenue : 0

  return {
    grossRevenue,
    attributedOrders,
    rtoRate,
    netRevenue,
    realizedROAS,
  }
}
