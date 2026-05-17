import { router, procedure } from "../trpc.js"
import { db } from "@d2c/database"
import { z } from "zod"

export const merchantRouter = router({
  /**
   * Get all orders for the shop
   */
  orders: procedure.query(async ({ ctx }) => {
    if (!ctx.shopId) throw new Error("Unauthorized")

    const orders = await db.order.findMany({
      where: { shopId: ctx.shopId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        shipments: { select: { id: true, awb: true, status: true, isStuck: true } },
      },
    })

    return orders.map((o: any) => ({
      id: o.id,
      name: o.shopifyOrderName,
      total: o.totalPrice,
      status: o.status,
      isRTO: o.isRTO || false,
      createdAt: o.createdAt,
      customerName: o.customer?.name,
      customerPhone: o.customer?.phone,
      shipmentCount: o.shipments.length,
      stuckShipments: o.shipments.filter((s: any) => s.isStuck).length,
    }))
  }),

  /**
   * Get all customers for the shop
   */
  customers: procedure.query(async ({ ctx }) => {
    if (!ctx.shopId) throw new Error("Unauthorized")

    const customers = await db.customer.findMany({
      where: { shopId: ctx.shopId },
      orderBy: { lastOrderAt: "desc" },
      take: 100,
      select: {
        id: true,
        phone: true,
        name: true,
        totalOrders: true,
        totalSpend: true,
        rtoRiskScore: true,
        ltvTier: true,
        lifecycleStage: true,
        lastOrderAt: true,
      },
    })

    return customers
  }),

  /**
   * Get stuck shipments (NDR queue)
   */
  ndr: procedure.query(async ({ ctx }) => {
    if (!ctx.shopId) throw new Error("Unauthorized")

    const stuck = await db.shipment.findMany({
      where: {
        isStuck: true,
        order: { shopId: ctx.shopId },
      },
      orderBy: { updatedAt: "asc" },
      include: {
        order: {
          select: {
            id: true,
            shopifyOrderName: true,
            totalPrice: true,
            customer: { select: { phone: true, name: true } },
          },
        },
      },
    })

    return stuck.map((s: any) => ({
      id: s.id,
      awb: s.awb,
      status: s.status,
      failedAttempts: s.failedAttempts,
      lastStatusAt: s.lastScannedAt,
      orderName: s.order.shopifyOrderName,
      orderTotal: s.order.totalPrice,
      customerPhone: s.order.customer?.phone,
      customerName: s.order.customer?.name,
    }))
  }),

  /**
   * Get pending returns for approval
   */
  returns: procedure.query(async ({ ctx }) => {
    if (!ctx.shopId) throw new Error("Unauthorized")

    const returns = await db.returnRequest.findMany({
      where: {
        status: "pending",
        shopId: ctx.shopId,
      },
      orderBy: { createdAt: "asc" },
      include: {
        order: {
          select: {
            id: true,
            shopifyOrderName: true,
            customer: { select: { phone: true, name: true } },
          },
        },
      },
    })

    return returns.map((r: any) => ({
      id: r.id,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
      orderName: r.order.shopifyOrderName,
      customerPhone: r.order.customer?.phone,
      customerName: r.order.customer?.name,
    }))
  }),

  /**
   * Approve or reject a return
   */
  approveReturn: procedure
    .input(z.object({ returnId: z.string(), approved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.shopId) throw new Error("Unauthorized")

      const ret = await db.returnRequest.findUniqueOrThrow({
        where: { id: input.returnId },
        include: { order: true },
      })

      if (ret.shopId !== ctx.shopId) {
        throw new Error("Unauthorized")
      }

      const updated = await db.returnRequest.update({
        where: { id: input.returnId },
        data: {
          status: input.approved ? "approved" : "rejected",
          approvedAt: input.approved ? new Date() : null,
        },
      })

      return {
        success: true,
        status: updated.status,
        message: input.approved
          ? "Return approved. Customer will receive pickup instructions."
          : "Return rejected.",
      }
    }),

  /**
   * Approve or reject an NDR action
   */
  approveNDR: procedure
    .input(
      z.object({
        shipmentId: z.string(),
        action: z.enum(["reattempt", "rto", "update_address"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.shopId) throw new Error("Unauthorized")

      const shipment = await db.shipment.findUniqueOrThrow({
        where: { id: input.shipmentId },
        include: { order: true },
      })

      if (shipment.order.shopId !== ctx.shopId) {
        throw new Error("Unauthorized")
      }

      let updated: any = shipment

      if (input.action === "reattempt") {
        updated = await db.shipment.update({
          where: { id: input.shipmentId },
          data: { isStuck: false, failedAttempts: 0 },
        })
      } else if (input.action === "rto") {
        updated = await db.shipment.update({
          where: { id: input.shipmentId },
          data: { rtoInitiatedAt: new Date(), isStuck: false },
        })
      }

      return {
        success: true,
        action: input.action,
        shipmentId: updated.id,
      }
    }),
})
