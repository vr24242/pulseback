import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop: shopDomain, payload } = await authenticate.webhook(request)
  if (topic !== "CHECKOUTS_UPDATE") return json({ ok: true })

  const checkout = payload as ShopifyCheckout

  try {
    const shop = await db.shop.findUnique({ where: { domain: shopDomain } })
    if (!shop) return json({ ok: true })

    const phone = checkout.phone ?? checkout.billing_address?.phone ?? checkout.shipping_address?.phone
    const email = checkout.email
    const normalizedPhone = phone ? phone.replace(/\D/g, "").slice(-10) : null
    const cartValue = parseFloat(checkout.total_price ?? "0")

    if (!checkout.token || cartValue < 1) return json({ ok: true })

    // Upsert the checkout session
    await db.checkoutSession.upsert({
      where: { shopifyCheckoutToken: checkout.token },
      create: {
        shopId: shop.id,
        shopifyCheckoutToken: checkout.token,
        cartValue,
        cartItems: checkout.line_items ?? [],
        phone: normalizedPhone,
        email: email?.toLowerCase() ?? null,
        pincode: checkout.shipping_address?.zip ?? null,
        status: "active",
        utmSource: checkout.landing_site?.match(/utm_source=([^&]+)/)?.[1] ?? null,
        utmMedium: checkout.landing_site?.match(/utm_medium=([^&]+)/)?.[1] ?? null,
        utmCampaign: checkout.landing_site?.match(/utm_campaign=([^&]+)/)?.[1] ?? null,
      },
      update: {
        cartValue,
        cartItems: checkout.line_items ?? [],
        phone: normalizedPhone ?? undefined,
        email: email?.toLowerCase() ?? undefined,
        pincode: checkout.shipping_address?.zip ?? undefined,
        updatedAt: new Date(),
      },
    })

    return json({ ok: true })
  } catch (err) {
    console.error("[webhooks/checkouts/update]", err)
    return json({ ok: true })
  }
}

interface ShopifyCheckout {
  token: string
  email?: string
  phone?: string
  total_price?: string
  landing_site?: string
  line_items: unknown[]
  billing_address?: { phone?: string; zip?: string }
  shipping_address?: { phone?: string; zip?: string }
}
