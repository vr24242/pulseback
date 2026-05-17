import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"
import { sendAbandonedCartRecovery } from "@d2c/core"

// Called every 5 minutes by external cron (cron-job.org)
// Header: X-Cron-Secret: <CRON_SECRET>
//
// Flow:
//   Shopify fires CHECKOUTS_UPDATE with abandoned_checkout_url → webhook sets status="abandoned", abandonedAt=now
//   This cron runs every 5 min → finds sessions abandoned ≥5 min ago → sends WhatsApp

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = request.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Sessions Shopify explicitly marked abandoned, at least 5 min ago, not yet messaged
  const sessions = await db.checkoutSession.findMany({
    where: {
      status: "abandoned",
      abandonedAt: { lte: fiveMinAgo, gte: twentyFourHoursAgo },
      recoverySentAt: null,
      phone: { not: null },
    },
    include: {
      shop: {
        select: {
          id: true,
          aiSensyApiKey: true,
          watiApiToken: true,
          watiPhoneNumber: true,
          waPhoneNumberId: true,
          waAccessToken: true,
        },
      },
    },
    take: 50,
  })

  let sent = 0
  let failed = 0

  for (const session of sessions) {
    try {
      const phone = session.phone!

      let customerName = "there"
      if (session.customerId) {
        const customer = await db.customer.findUnique({
          where: { id: session.customerId },
          select: { name: true },
        })
        customerName = customer?.name?.split(" ")[0] ?? "there"
      }

      const cartValue = `₹${session.cartValue.toLocaleString("en-IN")}`

      const result = await sendAbandonedCartRecovery({
        phone,
        name: customerName,
        cartValue,
        discountCode: "SAVE10",
        shopConfig: {
          aiSensyApiKey: session.shop.aiSensyApiKey,
          watiApiToken: session.shop.watiApiToken,
          watiApiUrl: session.shop.watiPhoneNumber,
          waPhoneNumberId: session.shop.waPhoneNumberId,
          waAccessToken: session.shop.waAccessToken,
        },
      })

      if (result.success) {
        await db.checkoutSession.update({
          where: { id: session.id },
          data: {
            recoverySentAt: new Date(),
            recoveryAttempts: { increment: 1 },
          },
        })

        if (session.customerId) {
          await db.communication.create({
            data: {
              shopId: session.shopId,
              customerId: session.customerId,
              channel: "whatsapp",
              direction: "outbound",
              messageId: result.messageId,
              templateName: "abandoned_cart_recovery",
              body: `Abandoned cart recovery sent — ${cartValue}`,
              triggerType: "checkout.abandoned",
              triggerRef: session.id,
              status: "sent",
              sentAt: new Date(),
            },
          })
        }

        sent++
      } else {
        failed++
      }
    } catch (err) {
      console.error("[cron/abandoned]", session.id, err)
      failed++
    }
  }

  return json({ processed: sessions.length, sent, failed })
}

export const loader = async () => json({ ok: true, endpoint: "abandoned-cart-cron" })
