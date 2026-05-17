import { db } from "@d2c/database"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

/**
 * Intelligence Agent
 *
 * Replaces: nobody does this today. The data exists but no one finds patterns.
 *
 * Capabilities:
 * 1. Daily Briefing — conversational merchant summary (9pm IST)
 * 2. Weekly Pattern Report — analyze 7-day outcomes
 * 3. Anomaly Detection — RTO spikes, return rate spikes, volume changes
 * 4. Cohort Analysis — which acquisition channels → best LTV
 * 5. Board Pack (future) — auto-generated monthly business report
 */

export interface DailyBriefing {
  date: Date
  ordersPlaced: number
  orderValue: number
  revenue: number
  codOrders: number
  prepaidOrders: number
  avgOrderValue: number
  returnsInitiated: number
  ndrsTriaged: number
  commsSent: number
  commsConverted: number
  conversionRate: number
  highlights: string[]
  alerts: string[]
  recommendation: string
  summary: string // Conversational paragraph written by Sonnet
}

export interface WeeklyReport {
  weekStart: Date
  weekEnd: Date
  ordersPlaced: number
  uniqueCustomers: number
  repeatRate: number // % of orders from repeat customers
  rtoRate: number // % of orders that became RTO
  returnRate: number // % of orders returned
  avgDeliveryDays: number
  topCommunicationTiming: string // e.g., "Tuesday 6pm converts 3.1x"
  topCourier: { carrier: string; successRate: number }
  topAcquisitionChannel: string
  patterns: string[]
  recommendations: string[]
}

export interface Anomaly {
  type: "rto_spike" | "return_spike" | "volume_drop" | "conversion_drop" | "delivery_delay"
  severity: "warning" | "alert" | "critical"
  metric: string // what's anomalous
  baselineValue: number
  currentValue: number
  percentChange: number
  detectedAt: Date
  affectedCustomers?: number
  recommendation: string
}

/**
 * Generate daily briefing for merchant.
 * Called at 9pm IST by briefing.worker.
 */
export async function generateDailyBriefing(shopId: string): Promise<DailyBriefing> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [ordersData, returnsData, ndrsData, commsData] = await Promise.all([
    // Orders today
    db.order.findMany({
      where: { shopId, createdAt: { gte: today } },
      select: { totalAmount: true, paymentType: true },
    }),
    // Returns initiated today
    db.returnRequest.findMany({
      where: {
        order: { shopId },
        requestedAt: { gte: today },
      },
    }),
    // NDRs triaged today
    db.shipment.findMany({
      where: {
        order: { shopId },
        status: "failed_delivery",
        lastTracked: { gte: today },
      },
    }),
    // Communications sent today
    db.communication.findMany({
      where: { shopId, direction: "outbound", sentAt: { gte: today } },
      select: { outcome: true },
    }),
  ])

  const ordersPlaced = ordersData.length
  const orderValue = ordersData.reduce((sum, o) => sum + o.totalAmount, 0)
  const avgOrderValue = ordersPlaced > 0 ? orderValue / ordersPlaced : 0
  const codOrders = ordersData.filter(o => o.paymentType === "cod").length
  const prepaidOrders = ordersData.filter(o => o.paymentType === "prepaid").length
  const revenue = orderValue // (simplified: not accounting for refunds/fees)

  const returnsInitiated = returnsData.length
  const ndrsTriaged = ndrsData.length
  const commsSent = commsData.length
  const commsConverted = commsData.filter(c => c.outcome === "converted").length
  const conversionRate = commsSent > 0 ? commsConverted / commsSent : 0

  // Generate insights using Haiku (fast, good enough for briefing)
  const highlights: string[] = []
  const alerts: string[] = []

  if (ordersPlaced > 0) {
    highlights.push(`📦 ${ordersPlaced} new orders`)
  }
  if (avgOrderValue > 1000) {
    highlights.push(`💰 Strong AOV: ₹${avgOrderValue.toFixed(0)}`)
  }
  if (conversionRate > 0.3) {
    highlights.push(`🎯 High comm conversion: ${(conversionRate * 100).toFixed(0)}%`)
  }

  if (returnsInitiated > ordersPlaced * 0.1) {
    alerts.push(`⚠️ Return rate unusually high: ${((returnsInitiated / ordersPlaced) * 100).toFixed(1)}%`)
  }
  if (ndrsTriaged > 5) {
    alerts.push(`📍 ${ndrsTriaged} NDRs today — monitor`)
  }

  const briefingPrompt = `Generate a conversational merchant briefing for a D2C India store.
Stats for today:
- Orders: ${ordersPlaced} (₹${orderValue.toFixed(0)} revenue)
- AOV: ₹${avgOrderValue.toFixed(0)}
- COD: ${codOrders}, Prepaid: ${prepaidOrders}
- Returns initiated: ${returnsInitiated}
- Communications: ${commsSent} sent, ${commsConverted} converted (${(conversionRate * 100).toFixed(0)}%)

Highlights: ${highlights.length ? highlights.join(", ") : "steady day"}
Alerts: ${alerts.length ? alerts.join(", ") : "none"}

Write a 2-3 sentence conversational summary (like texting a friend). No bullets, no fancy formatting.
Include one specific recommendation for tomorrow.`

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: briefingPrompt }],
    })

    const summary = response.content[0].type === "text" ? response.content[0].text : "Day completed"
    const recommendation = alerts.length > 0 ? alerts[0] : "All good, keep momentum"

    return {
      date: today,
      ordersPlaced,
      orderValue,
      revenue,
      codOrders,
      prepaidOrders,
      avgOrderValue,
      returnsInitiated,
      ndrsTriaged,
      commsSent,
      commsConverted,
      conversionRate,
      highlights,
      alerts,
      recommendation,
      summary,
    }
  } catch (err) {
    console.error("[IntelligenceAgent] briefing generation error:", err)
    return {
      date: today,
      ordersPlaced,
      orderValue,
      revenue,
      codOrders,
      prepaidOrders,
      avgOrderValue,
      returnsInitiated,
      ndrsTriaged,
      commsSent,
      commsConverted,
      conversionRate,
      highlights,
      alerts,
      recommendation: "Check dashboard for details",
      summary: `${ordersPlaced} orders today, ₹${revenue.toFixed(0)} revenue`,
    }
  }
}

/**
 * Detect anomalies in daily metrics.
 * Compare to baseline (7-day average).
 */
export async function detectAnomalies(shopId: string): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  const now = new Date()

  // Get baseline (7-day average, excluding today)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const baselineOrders = await db.order.findMany({
    where: {
      shopId,
      createdAt: { gte: sevenDaysAgo, lt: today },
    },
  })

  const baselineOrdersPerDay = baselineOrders.length / 7
  const baselineRTORate = baselineOrders.filter(o => o.isRTO).length / (baselineOrders.length || 1)

  // Check today's metrics
  const todayOrders = await db.order.findMany({
    where: { shopId, createdAt: { gte: today } },
  })

  const todayRTOCount = todayOrders.filter(o => o.isRTO).length
  const todayRTORate = todayRTOCount / (todayOrders.length || 1)

  // Anomaly 1: RTO spike
  if (todayRTORate > baselineRTORate * 1.5) {
    anomalies.push({
      type: "rto_spike",
      severity: todayRTORate > baselineRTORate * 2.5 ? "critical" : "alert",
      metric: "RTO rate",
      baselineValue: baselineRTORate,
      currentValue: todayRTORate,
      percentChange: ((todayRTORate - baselineRTORate) / baselineRTORate) * 100,
      detectedAt: now,
      recommendation: "Check delivery partner performance. High RTO pincode activated?",
    })
  }

  // Anomaly 2: Volume drop
  if (todayOrders.length < baselineOrdersPerDay * 0.5) {
    anomalies.push({
      type: "volume_drop",
      severity: "warning",
      metric: "Order volume",
      baselineValue: baselineOrdersPerDay,
      currentValue: todayOrders.length,
      percentChange: ((todayOrders.length - baselineOrdersPerDay) / baselineOrdersPerDay) * 100,
      detectedAt: now,
      recommendation: "Check ad spend, traffic sources, or if there's a technical issue",
    })
  }

  // Anomaly 3: Return spike
  const baselineReturns = await db.returnRequest.findMany({
    where: {
      order: { shopId },
      requestedAt: { gte: sevenDaysAgo, lt: today },
    },
  })
  const baselineReturnRate = baselineReturns.length / (baselineOrders.length || 1)

  const todayReturns = await db.returnRequest.findMany({
    where: {
      order: { shopId },
      requestedAt: { gte: today },
    },
  })
  const todayReturnRate = todayReturns.length / (todayOrders.length || 1)

  if (todayReturnRate > baselineReturnRate * 1.5) {
    anomalies.push({
      type: "return_spike",
      severity: "alert",
      metric: "Return rate",
      baselineValue: baselineReturnRate,
      currentValue: todayReturnRate,
      percentChange: ((todayReturnRate - baselineReturnRate) / baselineReturnRate) * 100,
      detectedAt: now,
      recommendation: "Quality issue with recent shipments? Check product reviews.",
    })
  }

  return anomalies
}

/**
 * Analyze 7-day performance patterns.
 * Identify what's working (e.g., best communication timing, top courier).
 */
export async function generateWeeklyReport(shopId: string): Promise<WeeklyReport> {
  const today = new Date()
  const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [orders, comms, shipments] = await Promise.all([
    db.order.findMany({
      where: { shopId, createdAt: { gte: weekStart } },
      include: { customer: true },
    }),
    db.communication.findMany({
      where: { shopId, direction: "outbound", sentAt: { gte: weekStart } },
      select: { sentAt: true, outcome: true, channel: true },
    }),
    db.shipment.findMany({
      where: {
        order: { shopId },
        dispatchedAt: { gte: weekStart },
      },
      include: { order: true },
    }),
  ])

  const ordersPlaced = orders.length
  const uniqueCustomers = new Set(orders.map(o => o.customerId)).size
  const repeatOrders = orders.filter(o => o.customer.totalOrders > 1).length
  const repeatRate = ordersPlaced > 0 ? repeatOrders / ordersPlaced : 0

  const rtoRate = orders.filter(o => o.isRTO).length / (ordersPlaced || 1)

  // Delivery days (only completed shipments)
  const deliveredShipments = shipments.filter(s => s.status === "delivered" && s.deliveredAt)
  const deliveryDays = deliveredShipments.map(
    s => (s.deliveredAt!.getTime() - s.dispatchedAt.getTime()) / (24 * 60 * 60 * 1000),
  )
  const avgDeliveryDays = deliveryDays.length > 0 ? deliveryDays.reduce((a, b) => a + b, 0) / deliveryDays.length : 0

  // Best communication timing (by success rate per hour)
  const commsByHour: Record<number, { sent: number; converted: number }> = {}
  for (const comm of comms) {
    const hour = new Date(comm.sentAt).getUTCHours()
    if (!commsByHour[hour]) commsByHour[hour] = { sent: 0, converted: 0 }
    commsByHour[hour].sent++
    if (comm.outcome === "converted") commsByHour[hour].converted++
  }

  let topHour = 0
  let topRate = 0
  for (const [hour, data] of Object.entries(commsByHour)) {
    const rate = data.converted / data.sent
    if (rate > topRate) {
      topRate = rate
      topHour = parseInt(hour)
    }
  }
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const topCommTime = `${daysOfWeek[topHour % 7]} ${topHour}:00 IST`

  // Top courier
  const shipmentsByCarrier: Record<string, { success: number; total: number }> = {}
  for (const ship of shipments) {
    if (!shipmentsByCarrier[ship.carrier]) shipmentsByCarrier[ship.carrier] = { success: 0, total: 0 }
    shipmentsByCarrier[ship.carrier].total++
    if (ship.status === "delivered") shipmentsByCarrier[ship.carrier].success++
  }

  let topCarrier = "N/A"
  let topSuccessRate = 0
  for (const [carrier, data] of Object.entries(shipmentsByCarrier)) {
    const rate = data.success / data.total
    if (rate > topSuccessRate) {
      topSuccessRate = rate
      topCarrier = carrier
    }
  }

  const patterns = [
    `${(repeatRate * 100).toFixed(0)}% of orders from repeat customers`,
    `${(rtoRate * 100).toFixed(1)}% RTO rate (vs. industry 8-12%)`,
    `Average delivery: ${avgDeliveryDays.toFixed(1)} days`,
    `Best communication time: ${topCommTime}`,
  ]

  const recommendations = [
    topSuccessRate < 0.85 ? `Consider routing more shipments through ${topCarrier}` : "Courier performance stable",
    repeatRate < 0.2 ? "Focus on retention campaigns for repeat orders" : "Strong repeat rate — focus on referrals",
    rtoRate > 0.12 ? "RTO rate elevated — review high-risk pincodes" : "RTO rate healthy",
  ]

  return {
    weekStart,
    weekEnd: today,
    ordersPlaced,
    uniqueCustomers,
    repeatRate,
    rtoRate,
    returnRate: 0, // TODO: calculate from returns data
    avgDeliveryDays,
    topCommunicationTiming: topCommTime,
    topCourier: { carrier: topCarrier, successRate: topSuccessRate },
    topAcquisitionChannel: "organic", // TODO: track UTM
    patterns,
    recommendations,
  }
}
