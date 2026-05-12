import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"
import { sendCODConfirmation, sendOrderConfirmation } from "@d2c/core"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop: shopDomain, payload } = await authenticate.webhook(request)
  if (topic !== "ORDERS_CREATE") return json({ ok: true })

  const order = payload as ShopifyOrder

  try {
    const shop = await db.shop.findUnique({ where: { domain: shopDomain } })
    if (!shop) return json({ ok: true })

    const phone = order.billing_address?.phone ?? order.shipping_address?.phone ?? order.phone
    const email = order.email
    const pincode = order.shipping_address?.zip
    const normalizedPhone = phone ? phone.replace(/\D/g, "").slice(-10) : null

    // ── Resolve or create customer ──
    let customer = null
    if (normalizedPhone) {
      customer = await db.customer.findUnique({
        where: { shopId_phone: { shopId: shop.id, phone: normalizedPhone } },
      })
    }
    if (!customer && email) {
      customer = await db.customer.findUnique({
        where: { shopId_email: { shopId: shop.id, email: email.toLowerCase() } },
      })
    }
    if (!customer) {
      customer = await db.customer.create({
        data: {
          shopId: shop.id,
          phone: normalizedPhone,
          email: email?.toLowerCase() ?? null,
          name: [order.billing_address?.first_name, order.billing_address?.last_name].filter(Boolean).join(" ") || null,
          pincode: pincode ?? null,
          shopifyCustomerId: order.customer?.id?.toString() ?? null,
          lifecycleStage: "first_buyer",
        },
      })
    }

    const isCOD =
      order.payment_gateway?.toLowerCase().includes("cod") ||
      order.payment_gateway?.toLowerCase().includes("cash")
    const paymentMethod = isCOD ? "cod" : "prepaid"

    // ── Upsert order ──
    const newOrder = await db.order.upsert({
      where: { shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId: order.id.toString() } },
      create: {
        shopId: shop.id,
        customerId: customer.id,
        shopifyOrderId: order.id.toString(),
        shopifyOrderName: order.name,
        totalPrice: parseFloat(order.total_price),
        subtotalPrice: parseFloat(order.subtotal_price ?? order.total_price),
        totalDiscount: parseFloat(order.total_discounts ?? "0"),
        currency: order.currency,
        paymentMethod,
        paymentStatus: order.financial_status,
        items: order.line_items ?? [],
        shippingAddress: order.shipping_address ?? null,
        pincode: pincode ?? null,
        status: "placed",
        rtoRisk: customer.rtoRiskScore,
        dispatchSlaAt: new Date(Date.now() + shop.dispatchSlaHours * 3600 * 1000),
      },
      update: {},
    })

    // ── Mark checkout session as completed ──
    if (order.checkout_token) {
      await db.checkoutSession.updateMany({
        where: { shopifyCheckoutToken: order.checkout_token, shopId: shop.id },
        data: { status: "completed", completedAt: new Date() },
      })
    }

    // ── Update customer stats ──
    const stats = await db.order.aggregate({
      where: { customerId: customer.id, status: { notIn: ["cancelled", "returned"] } },
      _count: { id: true },
      _sum: { totalPrice: true },
      _avg: { totalPrice: true },
    })

    const totalOrders = stats._count.id
    const totalSpend = stats._sum.totalPrice ?? 0

    let lifecycleStage = "first_buyer"
    if (totalOrders >= 5) lifecycleStage = "loyal"
    else if (totalOrders >= 2) lifecycleStage = "repeat"

    let ltvTier = "new"
    if (totalSpend > 50000) ltvTier = "vip"
    else if (totalSpend > 20000) ltvTier = "loyal"
    else if (totalSpend > 5000) ltvTier = "growing"

    await db.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders,
        totalSpend,
        averageOrderValue: stats._avg.totalPrice ?? 0,
        ltv: totalSpend,
        ltvTier,
        lifecycleStage,
        lastOrderAt: new Date(),
        lastSeenAt: new Date(),
        pincode: customer.pincode || pincode || null,
        name: customer.name || [order.billing_address?.first_name, order.billing_address?.last_name].filter(Boolean).join(" ") || null,
      },
    })

    // ── Timeline ──
    await db.timelineEvent.create({
      data: {
        customerId: customer.id,
        shopId: shop.id,
        eventType: "order.placed",
        title: `Order ${order.name} placed — ₹${parseFloat(order.total_price).toLocaleString("en-IN")}`,
        metadata: { orderId: newOrder.id, paymentMethod, amount: order.total_price },
      },
    })

    // ── WhatsApp notifications (fire-and-forget) ──
    if (normalizedPhone) {
      const customerName = customer.name?.split(" ")[0] ?? "there"
      const amount = `₹${parseFloat(order.total_price).toLocaleString("en-IN")}`

      if (isCOD) {
        // COD confirmation — ask customer to confirm before dispatch
        sendCODConfirmation({
          phone: normalizedPhone,
          name: customerName,
          orderName: order.name,
          amount,
          shopWaPhoneNumberId: shop.waPhoneNumberId ?? undefined,
          shopWaAccessToken: shop.waAccessToken ?? undefined,
        }).then(async (result) => {
          if (result.success) {
            await db.order.update({
              where: { id: newOrder.id },
              data: { codConfirmationSent: true },
            })
            await db.communication.create({
              data: {
                shopId: shop.id,
                customerId: customer!.id,
                channel: "whatsapp",
                direction: "outbound",
                messageId: result.messageId,
                templateName: "cod_confirmation",
                body: `COD confirmation sent for ${order.name}`,
                triggerType: "order.placed.cod",
                triggerRef: newOrder.id,
                status: "sent",
                sentAt: new Date(),
              },
            })
          }
        }).catch(console.error)
      } else {
        // Prepaid — send order confirmation
        sendOrderConfirmation({
          phone: normalizedPhone,
          name: customerName,
          orderName: order.name,
          amount,
          phoneNumberId: shop.waPhoneNumberId ?? undefined,
          accessToken: shop.waAccessToken ?? undefined,
        }).then(async (result) => {
          if (result.success) {
            await db.communication.create({
              data: {
                shopId: shop.id,
                customerId: customer!.id,
                channel: "whatsapp",
                direction: "outbound",
                messageId: result.messageId,
                templateName: "order_confirmed",
                body: `Order confirmation sent for ${order.name}`,
                triggerType: "order.placed.prepaid",
                triggerRef: newOrder.id,
                status: "sent",
                sentAt: new Date(),
              },
            })
          }
        }).catch(console.error)
      }
    }

    return json({ ok: true })
  } catch (err) {
    console.error("[webhooks/orders/create]", err)
    return json({ ok: true })
  }
}

interface ShopifyOrder {
  id: number
  name: string
  email: string
  phone?: string
  checkout_token?: string
  total_price: string
  subtotal_price?: string
  total_discounts?: string
  currency: string
  financial_status: string
  payment_gateway?: string
  customer?: { id: number }
  billing_address?: { first_name?: string; last_name?: string; phone?: string; zip?: string }
  shipping_address?: { first_name?: string; last_name?: string; phone?: string; zip?: string }
  line_items: unknown[]
}
