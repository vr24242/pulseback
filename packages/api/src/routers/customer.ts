import { publicProcedure, router } from "../trpc.js"
import { db } from "@d2c/database"
import { z } from "zod"

export const customerRouter = router({
  /**
   * Get a single order by order name and phone (public)
   */
  getOrder: publicProcedure
    .input(
      z.object({
        orderName: z.string(),
        phone: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const order = await db.order.findFirst({
        where: {
          shopifyOrderName: input.orderName,
          customer: { phone: input.phone },
        },
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
          shipments: {
            select: {
              id: true,
              awb: true,
              status: true,
              carrier: true,
              lastScannedAt: true,
              isStuck: true,
              failedAttempts: true,
            },
          },
          returnRequests: {
            select: {
              id: true,
              status: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      })

      if (!order) {
        throw new Error("Order not found")
      }

      const returnEligible =
        order.status === "delivered" &&
        !(order.returnRequests as any[]).some((r) => r.status === "pending")

      return {
        ...order,
        returnEligible,
      }
    }),

  /**
   * Check if a customer can initiate a return
   */
  checkReturn: publicProcedure
    .input(
      z.object({
        orderName: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const order = await db.order.findFirst({
        where: { shopifyOrderName: input.orderName },
        include: {
          returnRequests: {
            select: { status: true, createdAt: true },
          },
        },
      })

      if (!order) {
        return { eligible: false, reason: "Order not found" }
      }

      // Check if delivered
      if (order.status !== "delivered") {
        return { eligible: false, reason: "Order not yet delivered" }
      }

      // Check if within 7 days
      const daysSinceCreation =
        (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceCreation > 7) {
        return { eligible: false, reason: "Return window expired (7 days)" }
      }

      // Check if already has pending/approved return
      const hasActiveReturn = (order.returnRequests as any[]).some((r) =>
        ["pending", "approved"].includes(r.status),
      )
      if (hasActiveReturn) {
        return { eligible: false, reason: "Return already in progress" }
      }

      return { eligible: true }
    }),

  /**
   * Initiate a return
   */
  startReturn: publicProcedure
    .input(
      z.object({
        orderName: z.string(),
        items: z.array(z.string()),
        reason: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const order = await db.order.findFirst({
        where: { shopifyOrderName: input.orderName },
      })

      if (!order) {
        throw new Error("Order not found")
      }

      const returnRequest = await db.returnRequest.create({
        data: {
          orderId: order.id,
          shopId: order.shopId,
          customerId: order.customerId,
          reason: input.reason,
          items: input.items,
          status: "pending",
          refundMethod: "original_payment",
          refundAmount: 0,
        },
      })

      return {
        success: true,
        returnId: returnRequest.id,
        message: "Return request submitted. You will receive pickup instructions shortly.",
      }
    }),

  /**
   * Get customer's recent orders (for reorder)
   */
  getRecentOrders: publicProcedure
    .input(
      z.object({
        phone: z.string(),
        limit: z.number().default(10),
      }),
    )
    .query(async ({ input }) => {
      const orders = await db.order.findMany({
        where: { customer: { phone: input.phone } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          shopifyOrderName: true,
          status: true,
          totalPrice: true,
          createdAt: true,
        },
      })

      return orders.map((o: any) => ({
        id: o.id,
        name: o.shopifyOrderName,
        status: o.status,
        total: o.totalPrice,
        createdAt: o.createdAt,
      }))
    }),
})
