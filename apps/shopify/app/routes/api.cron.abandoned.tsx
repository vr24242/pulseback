import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"
import { sendAbandonedCartRecovery } from "@d2c/core"

// Called every 5 minutes by external cron (cron-job.org / Fly scheduled machine)
// Protected by CRON_SECRET header

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = request.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 30 * 60 * 1000) // 30 min ago
  const maxAge = new Date(Date.now() - 24 * 60 * 60 * 1000) // don't retry after 24h

  // Find abandoned checkouts not yet recovered
  const abandonedSessions = await db.checkoutSession.findMany({
    where: {
      status: "active",
      updatedAt: { lt: cutoff, gt: maxAge },
      recoverySentAt: null,
      OR: [
        { phone: { not: null } },
        { email: { not: null } },
      ],
    },
    include: { shop: true },
    take: 50, // process max 50 per run
  })

  let sent = 0
  let failed = 0

  for (const session of abandonedSessions) {
    try {
      const phone = session.phone
      if (!phone) continue

      // Get customer name if exists
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
        phoneNumberId: session.shop.waPhoneNumberId ?? undefined,
        accessToken: session.shop.waAccessToken ?? undefined,
      })

      if (result.success) {
        await db.checkoutSession.update({
          where: { id: session.id },
          data: {
            status: "abandoned",
            abandonedAt: session.abandonedAt ?? new Date(),
            recoverySentAt: new Date(),
            recoveryAttempts: { increment: 1 },
          },
        })

        // Log communication
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
      console.error("[cron/abandoned] session error", session.id, err)
      failed++
    }
  }

  return json({ processed: abandonedSessions.length, sent, failed })
}

// GET for health check
export const loader = async () => json({ ok: true, endpoint: "abandoned-cart-cron" })
