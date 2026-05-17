import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"

interface PlaceOrderBody {
  shopDomain: string
  phone: string
  email?: string
  name: string
  address: {
    address1: string
    address2?: string
    city: string
    province: string
    zip: string
    country: string
  }
  paymentMethod: "cod" | "prepaid"
  razorpayPaymentId?: string
  cartItems: Array<{ variantId: string; quantity: number; price: number; title: string }>
  cartTotal: number
  discountCode?: string
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json() as PlaceOrderBody
  const { shopDomain, phone, email, name, address, paymentMethod, razorpayPaymentId, cartItems, cartTotal, discountCode } = body

  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    select: { id: true, accessToken: true, domain: true, codBlockingEnabled: true, rtoThreshold: true },
  })
  if (!shop) return json({ error: "Shop not found" }, { status: 404 })

  // Validate COD is allowed for this customer (only if blocking is enabled)
  if (paymentMethod === "cod" && shop.codBlockingEnabled !== false) {
    const normalized = phone.replace(/\D/g, "").slice(-10)
    const customer = await db.customer.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone: normalized } },
      select: { rtoRiskScore: true },
    })
    if (customer && customer.rtoRiskScore >= (shop.rtoThreshold ?? 60)) {
      return json({ error: "COD not available for this order", codBlocked: true }, { status: 422 })
    }
  }

  // Build Draft Order payload for Shopify
  const [firstName, ...rest] = name.trim().split(" ")
  const lastName = rest.join(" ") || "."

  const lineItems = cartItems.map((item) => ({
    variant_id: item.variantId.replace("gid://shopify/ProductVariant/", ""),
    quantity: item.quantity,
  }))

  const draftOrderPayload: Record<string, unknown> = {
    draft_order: {
      line_items: lineItems,
      shipping_address: {
        first_name: firstName,
        last_name: lastName,
        address1: address.address1,
        address2: address.address2 ?? "",
        city: address.city,
        province: address.province,
        zip: address.zip,
        country: address.country,
        phone: phone,
      },
      billing_address: {
        first_name: firstName,
        last_name: lastName,
        address1: address.address1,
        city: address.city,
        province: address.province,
        zip: address.zip,
        country: address.country,
        phone: phone,
      },
      email: email ?? "",
      phone: phone,
      note: paymentMethod === "cod" ? "COD order via Pulseback" : `Prepaid via Pulseback | Razorpay: ${razorpayPaymentId ?? ""}`,
      tags: `pulseback,${paymentMethod}`,
      ...(discountCode ? { applied_discount: { code: discountCode, type: "percentage", amount: "0" } } : {}),
    },
  }

  // Create Draft Order via Shopify Admin API
  const draftRes = await fetch(
    `https://${shop.domain}/admin/api/2024-10/draft_orders.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shop.accessToken,
      },
      body: JSON.stringify(draftOrderPayload),
    }
  )

  if (!draftRes.ok) {
    const err = await draftRes.text()
    console.error("[checkout/place] Draft order error:", err)
    return json({ error: "Failed to create order" }, { status: 500 })
  }

  const { draft_order: draftOrder } = await draftRes.json() as { draft_order: { id: number; invoice_url: string; name: string } }

  // Complete the draft order (marks it as paid for prepaid, pending for COD)
  const completeRes = await fetch(
    `https://${shop.domain}/admin/api/2024-10/draft_orders/${draftOrder.id}/complete.json?payment_pending=${paymentMethod === "cod"}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shop.accessToken,
      },
    }
  )

  if (!completeRes.ok) {
    console.error("[checkout/place] Complete error:", await completeRes.text())
    return json({ error: "Failed to complete order" }, { status: 500 })
  }

  const { draft_order: completed } = await completeRes.json() as { draft_order: { order_id: number; name: string } }

  return json({
    ok: true,
    orderId: completed.order_id,
    orderName: completed.name ?? draftOrder.name,
    paymentMethod,
  })
}
