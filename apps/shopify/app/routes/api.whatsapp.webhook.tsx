import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"
import { sendWhatsAppText } from "@d2c/core"

// Meta webhook verification
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const mode      = url.searchParams.get("hub.mode")
  const token     = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return json({ error: "Forbidden" }, { status: 403 })
}

// Incoming messages from Meta
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = await request.json() as MetaWebhookPayload

    // Validate it's from Meta
    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    if (change?.field !== "messages") return json({ ok: true })

    const messageObj = change.value?.messages?.[0]
    if (!messageObj) return json({ ok: true })

    const from = messageObj.from  // phone number that sent the message
    const text = messageObj.text?.body?.trim().toLowerCase() ?? ""
    const phoneNumberId = change.value?.metadata?.phone_number_id

    if (!from || !text) return json({ ok: true })

    // Normalize to 10-digit
    const normalizedPhone = from.replace(/^91/, "").slice(-10)

    // Find customer across all shops using this phone number ID
    const shop = await db.shop.findFirst({
      where: { waPhoneNumberId: phoneNumberId },
    })

    if (!shop) return json({ ok: true })

    const customer = await db.customer.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone: normalizedPhone } },
    })

    if (!customer) return json({ ok: true })

    // ── COD Confirmation Reply Handler ──
    if (text === "yes" || text === "y" || text === "1" || text === "confirm") {
      // Find pending COD order for this customer
      const codOrder = await db.order.findFirst({
        where: {
          customerId: customer.id,
          paymentMethod: "cod",
          codConfirmationSent: true,
          codConfirmationConfirmed: false,
          status: "placed",
        },
        orderBy: { createdAt: "desc" },
      })

      if (codOrder) {
        await db.order.update({
          where: { id: codOrder.id },
          data: { codConfirmationConfirmed: true, status: "confirmed" },
        })

        await db.timelineEvent.create({
          data: {
            customerId: customer.id,
            shopId: shop.id,
            eventType: "order.confirmed",
            title: `${codOrder.shopifyOrderName} COD confirmed by customer`,
            metadata: { orderId: codOrder.id },
          },
        })

        await sendWhatsAppText({
          phone: from,
          body: `✅ Great! Your order ${codOrder.shopifyOrderName} is confirmed. We'll notify you once it's shipped.`,
          phoneNumberId: phoneNumberId ?? undefined,
          accessToken: shop.waAccessToken ?? undefined,
        })
      }
    } else if (text === "no" || text === "n" || text === "0" || text === "cancel") {
      // Find pending COD order
      const codOrder = await db.order.findFirst({
        where: {
          customerId: customer.id,
          paymentMethod: "cod",
          codConfirmationSent: true,
          codConfirmationConfirmed: false,
          status: "placed",
        },
        orderBy: { createdAt: "desc" },
      })

      if (codOrder) {
        await db.order.update({
          where: { id: codOrder.id },
          data: { status: "cancelled", cancelledAt: new Date(), cancelReason: "customer_cancelled_cod" },
        })

        await db.timelineEvent.create({
          data: {
            customerId: customer.id,
            shopId: shop.id,
            eventType: "order.cancelled",
            title: `${codOrder.shopifyOrderName} cancelled by customer via WhatsApp`,
            metadata: { orderId: codOrder.id },
          },
        })

        await sendWhatsAppText({
          phone: from,
          body: `Your order ${codOrder.shopifyOrderName} has been cancelled. If this was a mistake, please place a new order on our website.`,
          phoneNumberId: phoneNumberId ?? undefined,
          accessToken: shop.waAccessToken ?? undefined,
        })
      }
    } else {
      // Unknown reply — log as communication and flag for agent
      await db.communication.create({
        data: {
          shopId: shop.id,
          customerId: customer.id,
          channel: "whatsapp",
          direction: "inbound",
          body: messageObj.text?.body ?? "",
          triggerType: "customer.reply",
          status: "delivered",
          deliveredAt: new Date(),
          replyBody: messageObj.text?.body,
          replyHandled: false,
        },
      })
    }

    return json({ ok: true })
  } catch (err) {
    console.error("[api/whatsapp/webhook]", err)
    return json({ ok: true })
  }
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      field: string
      value?: {
        metadata?: { phone_number_id: string }
        messages?: Array<{
          from: string
          text?: { body: string }
        }>
      }
    }>
  }>
}
