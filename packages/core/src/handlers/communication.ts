/**
 * Communication OS — Event Handlers
 * Registers once per process (Node module cache). Import this file anywhere
 * before events are published and all handlers activate automatically.
 */
import { db } from "@d2c/database"
import { registerHandler } from "../events/bus"
import { sendWhatsAppTemplate } from "../communication/whatsapp"
import type { AppEvent } from "@d2c/shared"

let registered = false

export function initCommunicationHandlers() {
  if (registered) return
  registered = true

  // ── Shipping: Out for Delivery ─────────────────────────────────────────────
  registerHandler("communication", async (event: AppEvent) => {
    if (event.eventType !== "shipment.out_for_delivery") return
    const { shopId, customerId, metadata } = event
    if (!customerId) return

    const [customer, shop, order] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId }, select: { phone: true, name: true } }),
      db.shop.findUnique({ where: { id: shopId }, select: { aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true, waPhoneNumberId: true, waAccessToken: true } }),
      db.order.findUnique({ where: { id: metadata.orderId as string }, select: { shopifyOrderName: true } }),
    ])

    if (!customer?.phone || !shop || !order) return

    const result = await sendWhatsAppTemplate({
      phone: customer.phone,
      templateName: "order_out_for_delivery",
      bodyParams: [customer.name?.split(" ")[0] ?? "there", order.shopifyOrderName],
      shopConfig: shop,
    })

    if (result.success && customerId) {
      await logCommunication(shopId, customerId, "order_out_for_delivery", result.messageId, metadata.orderId as string, "shipment.out_for_delivery")
    }
  })

  // ── Shipping: Delivered ────────────────────────────────────────────────────
  registerHandler("communication", async (event: AppEvent) => {
    if (event.eventType !== "shipment.delivered") return
    const { shopId, customerId, metadata } = event
    if (!customerId) return

    const [customer, shop, order] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId }, select: { phone: true, name: true } }),
      db.shop.findUnique({ where: { id: shopId }, select: { aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true, waPhoneNumberId: true, waAccessToken: true } }),
      db.order.findUnique({ where: { id: metadata.orderId as string }, select: { shopifyOrderName: true } }),
    ])

    if (!customer?.phone || !shop || !order) return

    const result = await sendWhatsAppTemplate({
      phone: customer.phone,
      templateName: "order_delivered",
      bodyParams: [customer.name?.split(" ")[0] ?? "there", order.shopifyOrderName],
      shopConfig: shop,
    })

    if (result.success && customerId) {
      await logCommunication(shopId, customerId, "order_delivered", result.messageId, metadata.orderId as string, "shipment.delivered")
    }

    // Schedule review request 3 days later
    await db.retentionAction.create({
      data: {
        shopId,
        customerId,
        actionType: "review_request",
        scheduledFor: new Date(Date.now() + 3 * 86400000),
        status: "scheduled",
        metadata: { orderId: String(metadata.orderId ?? "") },
      },
    })
  })

  // ── Shipping: Failed Delivery ──────────────────────────────────────────────
  registerHandler("communication", async (event: AppEvent) => {
    if (event.eventType !== "shipment.failed_delivery") return
    const { shopId, customerId, metadata } = event
    if (!customerId) return

    const [customer, shop, order] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId }, select: { phone: true, name: true } }),
      db.shop.findUnique({ where: { id: shopId }, select: { aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true, waPhoneNumberId: true, waAccessToken: true } }),
      db.order.findUnique({ where: { id: metadata.orderId as string }, select: { shopifyOrderName: true } }),
    ])

    if (!customer?.phone || !shop || !order) return

    await sendWhatsAppTemplate({
      phone: customer.phone,
      templateName: "delivery_failed",
      bodyParams: [customer.name?.split(" ")[0] ?? "there", order.shopifyOrderName],
      shopConfig: shop,
    })
  })

  // ── Shipping: Stuck ────────────────────────────────────────────────────────
  registerHandler("communication", async (event: AppEvent) => {
    if (event.eventType !== "shipment.stuck") return
    const { shopId, customerId, metadata } = event
    if (!customerId) return

    const [customer, shop, order] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId }, select: { phone: true, name: true } }),
      db.shop.findUnique({ where: { id: shopId }, select: { aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true, waPhoneNumberId: true, waAccessToken: true } }),
      db.order.findUnique({ where: { id: metadata.orderId as string }, select: { shopifyOrderName: true } }),
    ])

    if (!customer?.phone || !shop || !order) return

    await sendWhatsAppTemplate({
      phone: customer.phone,
      templateName: "shipment_delayed",
      bodyParams: [customer.name?.split(" ")[0] ?? "there", order.shopifyOrderName],
      shopConfig: shop,
    })
  })

  // ── Shipping: RTO Initiated ────────────────────────────────────────────────
  registerHandler("communication", async (event: AppEvent) => {
    if (event.eventType !== "shipment.rto_initiated") return
    const { shopId, customerId, metadata } = event
    if (!customerId) return

    const [customer, shop, order] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId }, select: { phone: true, name: true } }),
      db.shop.findUnique({ where: { id: shopId }, select: { aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true, waPhoneNumberId: true, waAccessToken: true } }),
      db.order.findUnique({ where: { id: metadata.orderId as string }, select: { id: true, shopifyOrderName: true } }),
    ])

    if (!customer?.phone || !shop || !order) return

    await sendWhatsAppTemplate({
      phone: customer.phone,
      templateName: "rto_initiated",
      bodyParams: [customer.name?.split(" ")[0] ?? "there", order.shopifyOrderName],
      shopConfig: shop,
    })

    // Mark order as RTO
    await db.order.update({
      where: { id: order.id },
      data: { isRTO: true, rtoReason: "carrier_rto" },
    })

    // Update customer RTO stats
    await db.customer.update({
      where: { id: customerId },
      data: {
        totalReturns: { increment: 1 },
      },
    })
  })

  // ── Retention: Churn Risk → Schedule Win-Back ──────────────────────────────
  registerHandler("retention", async (event: AppEvent) => {
    if (event.eventType !== "retention.churn_risk_detected") return
    const { shopId, customerId, metadata } = event
    if (!customerId) return

    const action = metadata.suggestedAction as string
    const scheduledFor = action === "win_back_offer"
      ? new Date(Date.now() + 86400000)       // tomorrow
      : new Date(Date.now() + 3 * 86400000)   // 3 days

    // Only create if no pending action already exists
    const existing = await db.retentionAction.findFirst({
      where: { customerId, status: "scheduled" },
    })
    if (existing) return

    await db.retentionAction.create({
      data: {
        shopId,
        customerId,
        actionType: action === "win_back_offer" ? "win_back" : "churn_intervention",
        scheduledFor,
        status: "scheduled",
        metadata: { churnScore: Number(metadata.churnScore ?? 0), ltvTier: String(metadata.ltvTier ?? "") },
      },
    })
  })
}

async function logCommunication(
  shopId: string,
  customerId: string,
  templateName: string,
  messageId: string | undefined,
  triggerRef: string,
  triggerType: string
) {
  await db.communication.create({
    data: {
      shopId,
      customerId,
      channel: "whatsapp",
      direction: "outbound",
      messageId,
      templateName,
      body: templateName,
      triggerType,
      triggerRef,
      status: "sent",
      sentAt: new Date(),
    },
  })
}
