/**
 * returns.server.ts — Returns dashboard data service
 * All DB queries and mutations for the Returns OS merchant dashboard.
 * Loaders and actions stay thin — they call these functions and return.
 */

import { db } from "@d2c/database"
import { getShiprocketToken, createReversePickup } from "@d2c/core/shipping/shiprocket"

const RETURNS_PAGE_SIZE = 20

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ReturnFilter = "all" | "pending" | "approved" | "rejected" | "refunded"

export interface ReturnItem {
  title: string
  quantity: number
  price: number
  reason?: string
}

export interface ReturnRequest {
  id: string
  shopId: string
  orderId: string
  customerId: string | null
  items: ReturnItem[]
  reason: string
  reasonNote: string | null
  refundMethod: string
  refundAmount: number
  photoUrls: string[]
  status: string
  rejectionReason: string | null
  approvedAt: string | null
  rejectedAt: string | null
  shiprocketOrderId: string | null
  pickupScheduledAt: string | null
  pickedUpAt: string | null
  refundInitiatedAt: string | null
  refundCompletedAt: string | null
  createdAt: string
  updatedAt: string
  order: {
    shopifyOrderName: string
    totalPrice: number
    paymentMethod: string
  }
  customer: {
    name: string
    phone: string | null
  } | null
}

export interface ReturnsStats {
  totalRequests: number       // last 30 days
  pendingCount: number
  refundAmountIssued: number  // sum of refundAmount where status = refunded, last 30 days
  returnRate: number          // returns / total orders last 30 days (%)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getReturnsStats(shopId: string): Promise<ReturnsStats> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [totalRequests, pendingCount, refundedRows, totalOrders] = await Promise.all([
    db.returnRequest.count({
      where: { shopId, createdAt: { gte: since } },
    }),
    db.returnRequest.count({
      where: { shopId, status: "pending" },
    }),
    db.returnRequest.findMany({
      where: { shopId, status: "refunded", createdAt: { gte: since } },
      select: { refundAmount: true },
    }),
    db.order.count({
      where: { shopId, createdAt: { gte: since } },
    }),
  ])

  const refundAmountIssued = refundedRows.reduce((sum, r) => sum + r.refundAmount, 0)
  const returnRate = totalOrders > 0
    ? Math.round((totalRequests / totalOrders) * 1000) / 10
    : 0

  return { totalRequests, pendingCount, refundAmountIssued, returnRate }
}

// ─── List ─────────────────────────────────────────────────────────────────────

function buildWhere(shopId: string, filter: ReturnFilter) {
  const base = { shopId }
  if (filter === "pending")  return { ...base, status: "pending" }
  if (filter === "approved") return { ...base, status: { in: ["approved", "pickup_scheduled", "picked_up", "processed"] } }
  if (filter === "rejected") return { ...base, status: "rejected" }
  if (filter === "refunded") return { ...base, status: "refunded" }
  return base
}

export async function getReturnRequests(
  shopId: string,
  filter: ReturnFilter,
  page: number,
): Promise<{ requests: ReturnRequest[]; total: number }> {
  const where = buildWhere(shopId, filter)

  const [total, raw] = await Promise.all([
    db.returnRequest.count({ where }),
    db.returnRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * RETURNS_PAGE_SIZE,
      take: RETURNS_PAGE_SIZE,
      include: {
        order: {
          select: { shopifyOrderName: true, totalPrice: true, paymentMethod: true },
        },
        customer: {
          select: { name: true, phone: true },
        },
      },
    }),
  ])

  const requests = raw.map(r => ({
    id: r.id,
    shopId: r.shopId,
    orderId: r.orderId,
    customerId: r.customerId,
    items: r.items as unknown as ReturnItem[],
    reason: r.reason,
    reasonNote: r.reasonNote,
    refundMethod: r.refundMethod,
    refundAmount: r.refundAmount,
    photoUrls: r.photoUrls as unknown as string[],
    status: r.status,
    rejectionReason: r.rejectionReason,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    shiprocketOrderId: r.shiprocketOrderId,
    pickupScheduledAt: r.pickupScheduledAt?.toISOString() ?? null,
    pickedUpAt: r.pickedUpAt?.toISOString() ?? null,
    refundInitiatedAt: r.refundInitiatedAt?.toISOString() ?? null,
    refundCompletedAt: r.refundCompletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    order: {
      shopifyOrderName: r.order.shopifyOrderName,
      totalPrice: r.order.totalPrice,
      paymentMethod: r.order.paymentMethod,
    },
    customer: r.customer ? { name: r.customer.name ?? "", phone: r.customer.phone } : null,
  }))

  return { requests: requests as ReturnRequest[], total }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function approveReturnRequest(returnRequestId: string): Promise<ReturnRequest> {
  const updated = await db.returnRequest.update({
    where: { id: returnRequestId },
    data: { status: "approved", approvedAt: new Date() },
    include: {
      order: { select: { shopifyOrderName: true, totalPrice: true, paymentMethod: true } },
      customer: { select: { name: true, phone: true } },
    },
  })
  return serializeReturnRequest(updated)
}

export async function rejectReturnRequest(
  returnRequestId: string,
  rejectionReason: string,
): Promise<ReturnRequest> {
  const updated = await db.returnRequest.update({
    where: { id: returnRequestId },
    data: { status: "rejected", rejectedAt: new Date(), rejectionReason },
    include: {
      order: { select: { shopifyOrderName: true, totalPrice: true, paymentMethod: true } },
      customer: { select: { name: true, phone: true } },
    },
  })
  return serializeReturnRequest(updated)
}

export async function schedulePickup(
  returnRequestId: string,
  shopId: string,
): Promise<ReturnRequest> {
  // Fetch return request with order + customer info needed for Shiprocket
  const returnReq = await db.returnRequest.findUniqueOrThrow({
    where: { id: returnRequestId },
    include: {
      order: {
        select: {
          shopifyOrderName: true,
          totalPrice: true,
          paymentMethod: true,
          shippingAddress: true,
        },
      },
      customer: { select: { name: true, phone: true, city: true, state: true, pincode: true } },
    },
  })

  // Fetch shop for Shiprocket credentials (including cached JWT)
  const shop = await db.shop.findUniqueOrThrow({
    where: { id: shopId },
    select: {
      id: true,
      shiprocketEmail: true,
      shiprocketToken: true,
      shiprocketJwt: true,
      shiprocketJwtExpiresAt: true,
    },
  })

  let shiprocketOrderId: string | null = null

  if (shop.shiprocketEmail && shop.shiprocketToken) {
    try {
      // Use cached JWT if it exists and won't expire within 1 hour
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
      const hasFreshToken =
        shop.shiprocketJwt &&
        shop.shiprocketJwtExpiresAt &&
        shop.shiprocketJwtExpiresAt > oneHourFromNow

      let srToken: string
      if (hasFreshToken) {
        srToken = shop.shiprocketJwt as string
      } else {
        srToken = await getShiprocketToken(shop.shiprocketEmail, shop.shiprocketToken)
        await db.shop.update({
          where: { id: shopId },
          data: {
            shiprocketJwt: srToken,
            shiprocketJwtExpiresAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000), // 9 days (conservative)
          },
        })
      }

      // Resolve shipping address — prefer customer profile, fall back to order address
      const addr = returnReq.order.shippingAddress as Record<string, string> | null
      const customerName = returnReq.customer?.name ?? addr?.["name"] ?? "Customer"
      const customerPhone = returnReq.customer?.phone ?? addr?.["phone"] ?? ""
      const address = addr
        ? [addr["address1"], addr["address2"]].filter(Boolean).join(", ")
        : ""
      const city = returnReq.customer?.city ?? addr?.["city"] ?? ""
      const state = returnReq.customer?.state ?? addr?.["province"] ?? ""
      const pincode = returnReq.customer?.pincode ?? addr?.["zip"] ?? ""

      const items = (returnReq.items as unknown as ReturnItem[]).map(i => ({
        name: i.title,
        qty: i.quantity,
        price: i.price,
      }))

      const { orderId } = await createReversePickup(srToken, {
        orderNumber: returnReq.order.shopifyOrderName,
        customerId: returnReq.customerId ?? returnRequestId,
        customerName,
        customerPhone,
        address,
        city,
        state,
        pincode,
        items,
        totalValue: returnReq.refundAmount,
      })

      shiprocketOrderId = orderId
    } catch (err) {
      // Log but do not block — still update status for graceful degradation
      console.error("[schedulePickup] Shiprocket error:", err)
    }
  }

  const updated = await db.returnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: "pickup_scheduled",
      pickupScheduledAt: new Date(),
      ...(shiprocketOrderId ? { shiprocketOrderId } : {}),
    },
    include: {
      order: { select: { shopifyOrderName: true, totalPrice: true, paymentMethod: true } },
      customer: { select: { name: true, phone: true } },
    },
  })
  return serializeReturnRequest(updated)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type RawReturnWithRelations = {
  id: string
  shopId: string
  orderId: string
  customerId: string | null
  items: unknown
  reason: string
  reasonNote: string | null
  refundMethod: string
  refundAmount: number
  photoUrls: unknown
  status: string
  rejectionReason: string | null
  approvedAt: Date | null
  rejectedAt: Date | null
  shiprocketOrderId: string | null
  pickupScheduledAt: Date | null
  pickedUpAt: Date | null
  refundInitiatedAt: Date | null
  refundCompletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  order: { shopifyOrderName: string; totalPrice: number; paymentMethod: string }
  customer: { name: string | null; phone: string | null } | null
}

function serializeReturnRequest(r: RawReturnWithRelations): ReturnRequest {
  return {
    id: r.id,
    shopId: r.shopId,
    orderId: r.orderId,
    customerId: r.customerId,
    items: r.items as unknown as ReturnItem[],
    reason: r.reason,
    reasonNote: r.reasonNote,
    refundMethod: r.refundMethod,
    refundAmount: r.refundAmount,
    photoUrls: r.photoUrls as unknown as string[],
    status: r.status,
    rejectionReason: r.rejectionReason,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    shiprocketOrderId: r.shiprocketOrderId,
    pickupScheduledAt: r.pickupScheduledAt?.toISOString() ?? null,
    pickedUpAt: r.pickedUpAt?.toISOString() ?? null,
    refundInitiatedAt: r.refundInitiatedAt?.toISOString() ?? null,
    refundCompletedAt: r.refundCompletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    order: r.order,
    customer: r.customer ? { name: r.customer.name ?? "", phone: r.customer.phone } : null,
  }
}
