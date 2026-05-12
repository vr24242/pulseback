import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop: shopDomain, payload } = await authenticate.webhook(request)
  if (topic !== "CHECKOUTS_CREATE") return json({ ok: true })

  const checkout = payload as ShopifyCheckout

  try {
    const shop = await db.shop.findUnique({ where: { domain: shopDomain } })
    if (!shop) return json({ ok: true })

    const phone = checkout.phone
    const email = checkout.email
    const pincode = checkout.shipping_address?.zip
    const normalizedPhone = phone ? phone.replace(/\D/g, "").slice(-10) : null

    // Resolve customer if we have contact info
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

    const cartValue = parseFloat(checkout.total_price ?? "0")

    // Upsert checkout session
    await db.checkoutSession.upsert({
      where: { shopifyCheckoutToken: checkout.token },
      create: {
        shopId: shop.id,
        customerId: customer?.id ?? null,
        shopifyCheckoutToken: checkout.token,
        cartValue,
        cartItems: checkout.line_items ?? [],
        phone: normalizedPhone,
        email: email?.toLowerCase() ?? null,
        pincode: pincode ?? null,
        rtoRiskAtCheckout: customer?.rtoRiskScore ?? 30,
        codShown: (customer?.rtoRiskScore ?? 30) < shop.rtoThreshold,
        utmSource: checkout.source_name ?? null,
        status: "active",
      },
      update: {
        customerId: customer?.id ?? undefined,
        phone: normalizedPhone ?? undefined,
        email: email?.toLowerCase() ?? undefined,
      },
    })

    return json({ ok: true })
  } catch (err) {
    console.error("[webhooks/checkouts/create]", err)
    return json({ ok: true })
  }
}

interface ShopifyCheckout {
  token: string
  email?: string
  phone?: string
  total_price?: string
  source_name?: string
  shipping_address?: { zip?: string }
  line_items: unknown[]
}
