import { Worker, type Job } from "bullmq"
import { db } from "@d2c/database"
import { createRedisConnection } from "../redis"
import { queueCommunication } from "../queues"
import { generateTrackingUrl } from "../../utils/tokens"
import type { WebhookJobData } from "../queues"

// ─── Shopify Payload Types ────────────────────────────────────────────────────

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
  cancelled_at?: string
  cancel_reason?: string
  customer?: { id: number }
  billing_address?: { first_name?: string; last_name?: string; phone?: string; zip?: string }
  shipping_address?: { first_name?: string; last_name?: string; phone?: string; zip?: string }
  line_items: unknown[]
  fulfillments?: Array<{
    status: string
    tracking_number?: string
    tracking_company?: string
  }>
}

interface ShopifyCheckout {
  id: number
  token: string
  email?: string
  phone?: string
  total_price: string
  line_items: unknown[]
  billing_address?: { first_name?: string; last_name?: string; phone?: string; zip?: string }
  shipping_address?: { first_name?: string; last_name?: string; phone?: string; zip?: string }
  customer?: { id: number }
  abandoned_checkout_url: string
  created_at: string
  updated_at: string
}

// ─── Main Processor ───────────────────────────────────────────────────────────

async function processWebhookJob(job: Job<WebhookJobData>) {
  const { topic, shopDomain, payload } = job.data

  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    select: {
      id: true,
      dispatchSlaHours: true,
    },
  })
  if (!shop) {
    job.log(`Shop not found for domain: ${shopDomain}`)
    return { skipped: true, reason: "shop_not_found" }
  }

  switch (topic) {
    case "orders/create":
      return handleOrderCreate(job, shop.id, shop.dispatchSlaHours, payload as ShopifyOrder)

    case "orders/updated":
      return handleOrderUpdated(job, shop.id, payload as ShopifyOrder)

    case "checkouts/create":
    case "checkouts/update":
      return handleCheckout(job, shop.id, payload as ShopifyCheckout)

    case "app/uninstalled":
      return handleUninstall(job, shop.id)

    default:
      job.log(`Unhandled topic: ${topic}`)
      return { skipped: true, reason: "unhandled_topic" }
  }
}

// ─── orders/create ────────────────────────────────────────────────────────────

async function handleOrderCreate(
  job: Job,
  shopId: string,
  dispatchSlaHours: number,
  order: ShopifyOrder
) {
  job.log(`orders/create: ${order.name} (${order.id})`)

  const phone = order.billing_address?.phone ?? order.shipping_address?.phone ?? order.phone
  const email = order.email
  const pincode = order.shipping_address?.zip
  const normalizedPhone = phone ? phone.replace(/\D/g, "").slice(-10) : null

  // ── Resolve or create customer (idempotent) ──
  let customer = null
  if (normalizedPhone) {
    customer = await db.customer.findUnique({
      where: { shopId_phone: { shopId, phone: normalizedPhone } },
    })
  }
  if (!customer && email) {
    customer = await db.customer.findUnique({
      where: { shopId_email: { shopId, email: email.toLowerCase() } },
    })
  }
  if (!customer) {
    customer = await db.customer.create({
      data: {
        shopId,
        phone: normalizedPhone,
        email: email?.toLowerCase() ?? null,
        name:
          [order.billing_address?.first_name, order.billing_address?.last_name]
            .filter(Boolean)
            .join(" ") || null,
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

  // ── Upsert order (idempotent — Shopify may retry) ──
  const newOrder = await db.order.upsert({
    where: {
      shopId_shopifyOrderId: { shopId, shopifyOrderId: order.id.toString() },
    },
    create: {
      shopId,
      customerId: customer.id,
      shopifyOrderId: order.id.toString(),
      shopifyOrderName: order.name,
      totalPrice: parseFloat(order.total_price),
      subtotalPrice: parseFloat(order.subtotal_price ?? order.total_price),
      totalDiscount: parseFloat(order.total_discounts ?? "0"),
      currency: order.currency,
      paymentMethod,
      paymentStatus: order.financial_status,
      items: (order.line_items ?? []) as unknown as import("@prisma/client").Prisma.InputJsonValue,
      shippingAddress: (order.shipping_address ??
        undefined) as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
      pincode: pincode ?? null,
      status: "placed",
      rtoRisk: customer.rtoRiskScore,
      dispatchSlaAt: new Date(Date.now() + dispatchSlaHours * 3_600_000),
    },
    update: {}, // Don't overwrite if already exists
  })

  // ── Mark checkout as completed ──
  if (order.checkout_token) {
    await db.checkoutSession.updateMany({
      where: { shopifyCheckoutToken: order.checkout_token, shopId },
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
      name:
        customer.name ||
        [order.billing_address?.first_name, order.billing_address?.last_name]
          .filter(Boolean)
          .join(" ") ||
        null,
    },
  })

  // ── Timeline event (idempotent check) ──
  const existingEvent = await db.timelineEvent.findFirst({
    where: {
      customerId: customer.id,
      shopId,
      eventType: "order.placed",
      metadata: { path: ["orderId"], equals: newOrder.id },
    },
  })

  if (!existingEvent) {
    await db.timelineEvent.create({
      data: {
        customerId: customer.id,
        shopId,
        eventType: "order.placed",
        title: `Order ${order.name} placed — ₹${parseFloat(order.total_price).toLocaleString("en-IN")}`,
        metadata: {
          orderId: newOrder.id,
          paymentMethod,
          amount: order.total_price,
        },
      },
    })
  }

  // ── Queue WhatsApp notification ──
  if (normalizedPhone) {
    const customerName = customer.name?.split(" ")[0] ?? "there"
    const amount = `₹${parseFloat(order.total_price).toLocaleString("en-IN")}`
    const templateName = isCOD ? "cod_confirmation" : "order_confirmed"
    const triggerType = isCOD ? "order.placed.cod" : "order.placed.prepaid"

    // Generate tracking URL for customer
    let trackingUrl = ""
    try {
      trackingUrl = await generateTrackingUrl(
        shopId,
        customer.id,
        normalizedPhone,
        order.name,
        process.env.CUSTOMER_PWA_URL ?? "https://pulseback.app"
      )
    } catch (err) {
      job.log(`Warning: Failed to generate tracking URL: ${err}`)
    }

    await queueCommunication({
      shopId,
      customerId: customer.id,
      phone: normalizedPhone,
      channel: "whatsapp",
      templateName,
      bodyParams: [customerName, order.name, amount, trackingUrl],
      triggerType,
      triggerRef: newOrder.id,
      priority: "high",
    })
  }

  job.log(`✓ Order ${order.name} processed — ${paymentMethod}, customer ${customer.id}`)
  return { orderId: newOrder.id, customerId: customer.id, paymentMethod }
}

// ─── orders/updated ───────────────────────────────────────────────────────────

async function handleOrderUpdated(job: Job, shopId: string, order: ShopifyOrder) {
  job.log(`orders/updated: ${order.id}`)

  const dbOrder = await db.order.findUnique({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId: order.id.toString() } },
    include: {
      customer: { select: { id: true, phone: true, name: true } },
    },
  })
  if (!dbOrder) {
    job.log(`Order ${order.id} not found in DB — skipping`)
    return { skipped: true }
  }

  // ── Handle cancellation ──
  if (order.cancelled_at && dbOrder.status !== "cancelled") {
    await db.order.update({
      where: { id: dbOrder.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(order.cancelled_at),
        cancelReason: order.cancel_reason ?? null,
      },
    })

    if (dbOrder.customerId) {
      await db.timelineEvent.create({
        data: {
          customerId: dbOrder.customerId,
          shopId,
          eventType: "order.cancelled",
          title: `Order ${dbOrder.shopifyOrderName} cancelled`,
          metadata: { orderId: dbOrder.id, reason: order.cancel_reason },
        },
      })
    }

    job.log(`Order ${order.id} marked cancelled`)
  }

  // ── Handle fulfillment (dispatch) ──
  const fulfillment = order.fulfillments?.find(
    (f) => f.status === "success" && f.tracking_number
  )

  if (fulfillment?.tracking_number && dbOrder.status !== "dispatched") {
    const awb = fulfillment.tracking_number
    const carrier = detectCarrier(fulfillment.tracking_company ?? "")

    // Idempotent shipment creation
    const existingShipment = await db.shipment.findFirst({ where: { orderId: dbOrder.id } })

    if (!existingShipment) {
      await db.shipment.create({
        data: {
          orderId: dbOrder.id,
          awb,
          carrier,
          status: "in_transit",
          lastScannedAt: new Date(),
        },
      })
    }

    await db.order.update({
      where: { id: dbOrder.id },
      data: { status: "dispatched", dispatchedAt: new Date() },
    })

    if (dbOrder.customerId) {
      await db.timelineEvent.create({
        data: {
          customerId: dbOrder.customerId,
          shopId,
          eventType: "order.dispatched",
          title: `Order ${dbOrder.shopifyOrderName} dispatched — AWB: ${awb}`,
          metadata: { orderId: dbOrder.id, awb, carrier },
        },
      })
    }

    // Queue dispatch WhatsApp notification
    const phone = dbOrder.customer?.phone
    if (phone && dbOrder.customerId) {
      const name = dbOrder.customer?.name?.split(" ")[0] ?? "there"
      await queueCommunication({
        shopId,
        customerId: dbOrder.customerId,
        phone,
        channel: "whatsapp",
        templateName: "order_dispatched",
        bodyParams: [name, dbOrder.shopifyOrderName, awb, carrier],
        triggerType: "order.dispatched",
        triggerRef: dbOrder.id,
        priority: "high",
      })
    }

    job.log(`Order ${order.id} dispatched — AWB: ${awb}`)
  }

  return { processed: true }
}

// ─── checkouts/create + checkouts/update ─────────────────────────────────────

async function handleCheckout(job: Job, shopId: string, checkout: ShopifyCheckout) {
  job.log(`checkout: ${checkout.token}`)

  const phone = checkout.billing_address?.phone ?? checkout.shipping_address?.phone ?? checkout.phone
  const email = checkout.email
  const pincode = checkout.shipping_address?.zip
  const normalizedPhone = phone ? phone.replace(/\D/g, "").slice(-10) : null

  const totalPrice = parseFloat(checkout.total_price || "0")
  const updatedAt = new Date(checkout.updated_at)

  const isAbandoned = !!checkout.abandoned_checkout_url

  // Upsert checkout session — track for abandoned cart recovery
  await db.checkoutSession.upsert({
    where: { shopifyCheckoutToken: checkout.token },
    create: {
      shopId,
      shopifyCheckoutToken: checkout.token,
      phone: normalizedPhone,
      email: email?.toLowerCase() ?? null,
      pincode: pincode ?? null,
      cartValue: totalPrice,
      cartItems: (checkout.line_items ?? []) as unknown as import("@prisma/client").Prisma.InputJsonValue,
      status: isAbandoned ? "abandoned" : "active",
      abandonedAt: isAbandoned ? updatedAt : null,
    },
    update: {
      cartValue: totalPrice,
      cartItems: (checkout.line_items ?? []) as unknown as import("@prisma/client").Prisma.InputJsonValue,
      phone: normalizedPhone ?? undefined,
      email: email?.toLowerCase() ?? undefined,
      pincode: pincode ?? undefined,
      ...(isAbandoned ? { status: "abandoned", abandonedAt: updatedAt } : {}),
    },
  })

  job.log(`Checkout ${checkout.token} upserted — ₹${totalPrice}`)
  return { checkoutToken: checkout.token, cartValue: totalPrice }
}

// ─── app/uninstalled ──────────────────────────────────────────────────────────

async function handleUninstall(job: Job, shopId: string) {
  job.log(`app/uninstalled for shopId: ${shopId}`)

  await db.shop.update({
    where: { id: shopId },
    data: {
      isActive: false,
      uninstalledAt: new Date(),
    },
  })

  job.log(`Shop ${shopId} marked inactive`)
  return { deactivated: true }
}

// ─── Carrier Detection ────────────────────────────────────────────────────────

function detectCarrier(trackingCompany: string): string {
  const n = trackingCompany.toLowerCase()
  if (n.includes("delhivery"))                        return "delhivery"
  if (n.includes("bluedart") || n.includes("blue dart")) return "bluedart"
  if (n.includes("xpressbees"))                       return "xpressbees"
  if (n.includes("ecom"))                             return "ecom"
  if (n.includes("dtdc"))                             return "dtdc"
  if (n.includes("shiprocket"))                       return "shiprocket"
  return "other"
}

// ─── Worker Export ────────────────────────────────────────────────────────────

export function startWebhookWorker() {
  const worker = new Worker<WebhookJobData>(
    "webhook",
    processWebhookJob,
    {
      connection: createRedisConnection(),
      concurrency: 10,
    }
  )

  worker.on("completed", (job, result) => {
    if (!result?.skipped) {
      console.log(`[webhook] ✓ ${job.name} — ${job.id}`)
    }
  })
  worker.on("failed", (job, err) => {
    console.error(`[webhook] ✗ ${job?.name} (${job?.id}) — ${err.message}`)
  })

  return worker
}
