import { db } from "@d2c/database"
import { publishEvent } from "../events/bus"
import { scoreRTO, determineLtvTier } from "../identity/scorer"
import type { OrderPlacedEvent } from "@d2c/shared"

interface ShopifyOrderWebhook {
  id: number
  order_number: number
  email?: string
  phone?: string
  total_price: string
  subtotal_price: string
  total_tax: string
  total_discounts: string
  currency: string
  financial_status: string
  gateway: string
  line_items: Array<{
    id: number
    product_id: number
    variant_id: number
    title: string
    quantity: number
    price: string
    sku?: string
  }>
  shipping_address?: {
    name: string
    phone?: string
    address1: string
    address2?: string
    city: string
    province: string
    zip: string
    country: string
  }
  source_name?: string
  checkout_token?: string
}

export async function handleOrderPlaced(
  shopId: string,
  webhook: ShopifyOrderWebhook,
  shopifyCustomerId?: string
): Promise<void> {
  const paymentMethod = webhook.gateway?.includes("cod") ? "cod" : "prepaid"
  const pincode = webhook.shipping_address?.zip
  const totalPrice = parseFloat(webhook.total_price)

  const customer = await findCustomerForOrder(shopId, {
    shopifyCustomerId,
    phone: webhook.phone,
    email: webhook.email,
  })

  const rtoRisk = customer
    ? scoreRTO({
        pincode,
        paymentMethod,
        orderValue: totalPrice,
        customerHistory: {
          totalOrders: customer.totalOrders,
          totalRTOs: customer.totalReturns,
          returnRate: customer.returnRate,
        },
      })
    : scoreRTO({ pincode, paymentMethod, orderValue: totalPrice })

  const order = await db.order.create({
    data: {
      shopId,
      customerId: customer?.id,
      shopifyOrderId: String(webhook.id),
      shopifyOrderName: `#${webhook.order_number}`,
      totalPrice,
      subtotalPrice: parseFloat(webhook.subtotal_price),
      totalTax: parseFloat(webhook.total_tax),
      totalDiscount: parseFloat(webhook.total_discounts),
      currency: webhook.currency,
      paymentMethod,
      paymentStatus: webhook.financial_status === "paid" ? "paid" : "pending",
      items: webhook.line_items.map((li) => ({
        productId: String(li.product_id),
        variantId: String(li.variant_id),
        name: li.title,
        quantity: li.quantity,
        price: parseFloat(li.price),
        sku: li.sku,
      })),
      shippingAddress: webhook.shipping_address ?? undefined,
      pincode,
      rtoRisk,
      dispatchSlaAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      sourceCheckoutToken: webhook.checkout_token,
    },
  })

  if (customer) {
    const newTotalOrders = customer.totalOrders + 1
    const newTotalSpend = customer.totalSpend + totalPrice
    const newLtv = newTotalSpend

    await db.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: newTotalOrders,
        totalSpend: newTotalSpend,
        averageOrderValue: newTotalSpend / newTotalOrders,
        ltv: newLtv,
        ltvTier: determineLtvTier(newLtv, newTotalOrders),
        lastOrderAt: new Date(),
        lifecycleStage: newTotalOrders === 1 ? "first_buyer" : "repeat",
      },
    })

    await db.timelineEvent.create({
      data: {
        customerId: customer.id,
        shopId,
        eventType: "order.placed",
        title: `Order ${order.shopifyOrderName} placed — ₹${totalPrice.toLocaleString("en-IN")}`,
        metadata: { orderId: order.id, paymentMethod, rtoRisk },
      },
    })
  }

  if (webhook.checkout_token) {
    await db.checkoutSession.updateMany({
      where: { shopifyCheckoutToken: webhook.checkout_token },
      data: { status: "completed", completedAt: new Date() },
    })
  }

  const event: OrderPlacedEvent = {
    eventType: "order.placed",
    shopId,
    customerId: customer?.id,
    timestamp: new Date(),
    metadata: {
      orderId: order.id,
      shopifyOrderId: String(webhook.id),
      shopifyOrderName: `#${webhook.order_number}`,
      totalPrice,
      paymentMethod,
      items: webhook.line_items.map((li) => ({
        productId: String(li.product_id),
        name: li.title,
        quantity: li.quantity,
        price: parseFloat(li.price),
      })),
      rtoRisk,
    },
  }

  await publishEvent(event)
}

async function findCustomerForOrder(
  shopId: string,
  identifiers: { shopifyCustomerId?: string; phone?: string; email?: string }
) {
  if (identifiers.shopifyCustomerId) {
    const c = await db.customer.findUnique({
      where: { shopId_shopifyCustomerId: { shopId, shopifyCustomerId: identifiers.shopifyCustomerId } },
    })
    if (c) return c
  }
  if (identifiers.phone) {
    const c = await db.customer.findUnique({
      where: { shopId_phone: { shopId, phone: identifiers.phone } },
    })
    if (c) return c
  }
  if (identifiers.email) {
    const c = await db.customer.findUnique({
      where: { shopId_email: { shopId, email: identifiers.email } },
    })
    if (c) return c
  }
  return null
}
