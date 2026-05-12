import type { ActionFunctionArgs } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"
import { resolveIdentity } from "@d2c/core"
import { publishEvent } from "@d2c/core"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request)
  if (topic !== "CHECKOUTS_CREATE") return new Response("Unhandled", { status: 404 })

  const shopRecord = await db.shop.findUnique({ where: { domain: shop } })
  if (!shopRecord) return new Response("Shop not found", { status: 404 })

  const checkout = payload as {
    token: string
    email?: string
    phone?: string
    total_price: string
    line_items: Array<{ product_id: number; quantity: number; price: string }>
    shipping_address?: { zip?: string }
    source_name?: string
  }

  // Capture identity if phone/email available
  let customer = null
  if (checkout.phone || checkout.email) {
    const result = await resolveIdentity({
      phone: checkout.phone,
      email: checkout.email,
      shopId: shopRecord.id,
      pincode: checkout.shipping_address?.zip,
    })
    customer = result.customer
  }

  // Create checkout session record
  await db.checkoutSession.upsert({
    where: { shopifyCheckoutToken: checkout.token },
    create: {
      shopId: shopRecord.id,
      customerId: customer?.id,
      shopifyCheckoutToken: checkout.token,
      cartValue: parseFloat(checkout.total_price),
      cartItems: checkout.line_items.map((li) => ({
        productId: String(li.product_id),
        quantity: li.quantity,
        price: parseFloat(li.price),
      })),
      phone: checkout.phone,
      email: checkout.email,
      pincode: checkout.shipping_address?.zip,
      status: "active",
    },
    update: {
      phone: checkout.phone,
      email: checkout.email,
      customerId: customer?.id,
      cartValue: parseFloat(checkout.total_price),
    },
  })

  await publishEvent({
    eventType: "checkout.started",
    shopId: shopRecord.id,
    customerId: customer?.id,
    timestamp: new Date(),
    metadata: {
      sessionToken: checkout.token,
      cartValue: parseFloat(checkout.total_price),
      cartItems: checkout.line_items.map((li) => ({
        productId: String(li.product_id),
        quantity: li.quantity,
        price: parseFloat(li.price),
      })),
    },
  })

  return new Response("OK", { status: 200 })
}
