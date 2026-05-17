import { db } from "@d2c/database"

export interface CustomerMemory {
  // Identity
  customerId: string
  shopId: string
  phone?: string
  email?: string
  name?: string

  // Live scores
  rtoRiskScore: number
  rfmScore: number        // use churnScore inverse — 100 - churnScore
  churnScore: number
  ltvTier: string         // new / low / mid / high / vip (map from existing ltvTier values)
  lifecycleStage: string  // prospect/active/champion/at_risk/lapsed/churned

  // Order history
  totalOrders: number
  totalReturns: number
  returnRate: number
  avgOrderValue: number
  totalSpend: number
  rtoCount: number        // count orders where isRTO=true
  lastOrderAt?: Date

  // Communication history — last 10 outbound, newest first
  recentComms: Array<{
    id: string
    type: string          // triggerType value
    sentAt: Date
    replied: boolean      // status === 'replied' or repliedAt is set
    converted: boolean    // outcome === 'converted'
    channel: string
    outcomeRef?: string
    outcome?: string
  }>

  // Derived behavioural patterns
  hasIgnoredLast3Comms: boolean   // last 3 outbound comms had no reply and outcome=ignored/null
  preferredReplyHour?: number     // IST hour (0-23) they most often reply — from repliedAt history
  preferredLanguage: string       // 'en' (default) — future: detect from WA sessions
  sentiment: string               // 'neutral' (default) — future: from WA sessions

  // Coordination flags — checked before ANY marketing comm
  hasOpenNDR: boolean        // any shipment with isStuck=true
  hasPendingRefund: boolean  // any ReturnRequest with status=approved but not refunded
  hasPendingReturn: boolean  // any ReturnRequest with status=pending
}

export async function getCustomerMemory(customerId: string): Promise<CustomerMemory> {
  const [customer, recentCommsRaw, rtoCount, openNDR, pendingReturn] = await Promise.all([
    db.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: {
        id: true, shopId: true, phone: true, email: true, name: true,
        rtoRiskScore: true, churnScore: true, ltvTier: true, lifecycleStage: true,
        totalOrders: true, totalReturns: true, returnRate: true,
        averageOrderValue: true, totalSpend: true, lastOrderAt: true,
      },
    }),
    db.communication.findMany({
      where: { customerId, direction: "outbound" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, triggerType: true, sentAt: true, repliedAt: true,
        status: true, channel: true, outcomeRef: true, outcome: true,
      },
    }),
    db.order.count({ where: { customerId, isRTO: true } }),
    db.shipment.findFirst({
      where: { order: { customerId }, isStuck: true },
      select: { id: true },
    }),
    db.returnRequest.findFirst({
      where: { order: { customerId }, status: { in: ["pending", "approved"] } },
      select: { id: true, status: true },
    }),
  ])

  const recentComms = recentCommsRaw.map((c) => ({
    id: c.id,
    type: c.triggerType,
    sentAt: c.sentAt ?? c.id as unknown as Date, // fallback
    replied: !!(c.repliedAt || c.status === "replied"),
    converted: c.outcome === "converted",
    channel: c.channel,
    outcomeRef: c.outcomeRef ?? undefined,
    outcome: c.outcome ?? undefined,
  }))

  // hasIgnoredLast3Comms: last 3 outbound with no reply and no positive outcome
  const last3 = recentComms.slice(0, 3)
  const hasIgnoredLast3Comms =
    last3.length === 3 &&
    last3.every((c) => !c.replied && c.outcome !== "converted")

  // preferredReplyHour: most common IST hour across replied comms
  const repliedComms = recentCommsRaw.filter((c) => c.repliedAt)
  let preferredReplyHour: number | undefined
  if (repliedComms.length > 0) {
    const hours = repliedComms.map((c) => {
      const d = new Date(c.repliedAt!)
      return (d.getUTCHours() + 5) % 24 // UTC to IST (approx)
    })
    const freq: Record<number, number> = {}
    for (const h of hours) freq[h] = (freq[h] ?? 0) + 1
    preferredReplyHour = parseInt(
      Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
    )
  }

  // Map ltvTier — existing values: new/growing/loyal/vip/lapsed → normalise
  const tierMap: Record<string, string> = {
    new: "new", growing: "mid", loyal: "high", vip: "vip", lapsed: "low",
  }
  const ltvTier = tierMap[customer.ltvTier] ?? "new"

  return {
    customerId: customer.id,
    shopId: customer.shopId,
    phone: customer.phone ?? undefined,
    email: customer.email ?? undefined,
    name: customer.name ?? undefined,
    rtoRiskScore: customer.rtoRiskScore,
    rfmScore: Math.max(0, 100 - customer.churnScore),
    churnScore: customer.churnScore,
    ltvTier,
    lifecycleStage: customer.lifecycleStage,
    totalOrders: customer.totalOrders,
    totalReturns: customer.totalReturns,
    returnRate: customer.returnRate,
    avgOrderValue: customer.averageOrderValue,
    totalSpend: customer.totalSpend,
    rtoCount,
    lastOrderAt: customer.lastOrderAt ?? undefined,
    recentComms,
    hasIgnoredLast3Comms,
    preferredReplyHour,
    preferredLanguage: "en",
    sentiment: "neutral",
    hasOpenNDR: !!openNDR,
    hasPendingRefund: pendingReturn?.status === "approved",
    hasPendingReturn: pendingReturn?.status === "pending",
  }
}
