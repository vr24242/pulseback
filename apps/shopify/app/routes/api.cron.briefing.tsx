import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"
import { sendWhatsAppText } from "@d2c/core"

// Runs daily at 9am — sends merchant a WhatsApp briefing
// POST /api/cron/briefing  |  Header: X-Cron-Secret
// Merchant phone configured in Settings (ownerPhone field)

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = request.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const shops = await db.shop.findMany({
    where: { isActive: true },
    select: {
      id: true, domain: true, name: true,
      waPhoneNumberId: true, waAccessToken: true,
      aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true,
    },
  })

  const results: Record<string, string> = {}

  for (const shop of shops) {
    try {
      const briefing = await buildBriefing(shop.id, shop.name ?? shop.domain)

      // Send to env-configured merchant phone (set MERCHANT_PHONE_<SHOP_ID> or MERCHANT_PHONE)
      const merchantPhone = process.env[`MERCHANT_PHONE_${shop.id}`] ?? process.env.MERCHANT_PHONE
      if (!merchantPhone) {
        results[shop.domain] = "no merchant phone configured"
        continue
      }

      await sendWhatsAppText({
        phone: merchantPhone,
        body: briefing,
        shopConfig: {
          waPhoneNumberId: shop.waPhoneNumberId ?? undefined,
          waAccessToken: shop.waAccessToken ?? undefined,
          aiSensyApiKey: shop.aiSensyApiKey ?? undefined,
          watiApiToken: shop.watiApiToken ?? undefined,
          watiApiUrl: shop.watiPhoneNumber ?? undefined,
        },
      })

      results[shop.domain] = "sent"
    } catch (err) {
      results[shop.domain] = String(err)
    }
  }

  return json({ shops: shops.length, results })
}

async function buildBriefing(shopId: string, shopName: string): Promise<string> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today.getTime() - 86400000)

  const [
    todayRevenue,
    todayOrders,
    codToday,
    abandonedYesterday,
    atRisk,
    stuckShipments,
    pendingSLA,
    winbackDue,
  ] = await Promise.all([
    db.order.aggregate({
      where: { shopId, createdAt: { gte: today }, status: { notIn: ["cancelled"] } },
      _sum: { totalPrice: true },
      _count: { id: true },
    }),
    db.order.count({ where: { shopId, createdAt: { gte: today } } }),
    db.order.count({ where: { shopId, paymentMethod: "cod", createdAt: { gte: today } } }),
    db.checkoutSession.count({
      where: { shopId, status: "abandoned", abandonedAt: { gte: yesterday, lt: today } },
    }),
    db.customer.count({ where: { shopId, lifecycleStage: { in: ["at_risk", "lapsed"] } } }),
    db.shipment.count({ where: { order: { shopId }, isStuck: true } }),
    db.order.count({
      where: {
        shopId, status: "placed",
        dispatchSlaAt: { lt: new Date() },
        dispatchedAt: null,
      },
    }),
    db.retentionAction.count({
      where: { shopId, status: "scheduled", scheduledFor: { lte: new Date() } },
    }),
  ])

  const revenue = todayRevenue._sum.totalPrice ?? 0
  const orderCount = todayRevenue._count.id

  const lines = [
    `*☀️ Good morning, ${shopName}!*`,
    ``,
    `*📊 Today so far*`,
    `• Revenue: ₹${revenue.toLocaleString("en-IN")} (${orderCount} orders)`,
    `• COD orders: ${codToday}`,
    ``,
    `*📣 Yesterday*`,
    `• Abandoned carts: ${abandonedYesterday}`,
    ``,
    `*⚠️ Needs attention*`,
    ...(pendingSLA > 0  ? [`• ${pendingSLA} order(s) past dispatch SLA 🚨`] : []),
    ...(stuckShipments > 0 ? [`• ${stuckShipments} shipment(s) stuck >48h`] : []),
    ...(atRisk > 0     ? [`• ${atRisk} at-risk / lapsed customers`] : []),
    ...(winbackDue > 0 ? [`• ${winbackDue} win-back message(s) queued`] : []),
    ...(pendingSLA === 0 && stuckShipments === 0 && atRisk === 0 ? [`• All clear ✅`] : []),
    ``,
    `_View dashboard: https://pulseback.fly.dev_`,
  ]

  return lines.join("\n")
}

export const loader = async () => json({ ok: true, endpoint: "briefing-cron" })
