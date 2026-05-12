import { db } from "@d2c/database"
import { publishEvent } from "../events/bus"
import type { ShipmentStatus } from "@d2c/shared"

const STUCK_THRESHOLD_HOURS = 48
const CARRIERS: Record<string, string> = {
  shiprocket: "Shiprocket",
  delhivery: "Delhivery",
  bluedart: "Blue Dart",
  xpressbees: "XpressBees",
  ecom: "Ecom Express",
}

// Called by a cron job every 2 hours for all active shipments
export async function pollActiveShipments(shopId: string): Promise<void> {
  const activeShipments = await db.shipment.findMany({
    where: {
      order: { shopId },
      status: { notIn: ["delivered", "rto_delivered"] },
    },
    include: { order: { select: { shopId: true, customerId: true, id: true } } },
  })

  await Promise.allSettled(activeShipments.map(processShipment))
}

async function processShipment(shipment: {
  id: string
  awb: string
  carrier: string
  status: string
  lastScannedAt: Date | null
  stuckSince: Date | null
  isStuck: boolean
  failedAttempts: number
  dispatchNotifSent: boolean
  outForDeliveryNotif: boolean
  stuckNotifSent: boolean
  failedDeliveryNotif: boolean
  rtoInterventionSent: boolean
  order: { shopId: string; customerId: string | null; id: string }
}): Promise<void> {
  const latestStatus = await fetchCarrierStatus(shipment.carrier, shipment.awb)
  if (!latestStatus) return

  const statusChanged = latestStatus.status !== shipment.status

  // Detect stuck shipment
  const hoursSinceLastScan = shipment.lastScannedAt
    ? (Date.now() - shipment.lastScannedAt.getTime()) / 3600000
    : 999

  const isNowStuck = hoursSinceLastScan > STUCK_THRESHOLD_HOURS

  await db.shipment.update({
    where: { id: shipment.id },
    data: {
      status: latestStatus.status as ShipmentStatus,
      rawStatus: latestStatus.rawStatus,
      lastScannedAt: latestStatus.scannedAt ?? new Date(),
      isStuck: isNowStuck,
      stuckSince: isNowStuck && !shipment.isStuck ? new Date() : shipment.stuckSince,
      deliveredAt:
        latestStatus.status === "delivered" ? new Date() : undefined,
    },
  })

  if (!statusChanged && !isNowStuck) return

  const { shopId, customerId, id: orderId } = shipment.order

  // Fire events for status transitions
  if (statusChanged) {
    if (latestStatus.status === "out_for_delivery" && !shipment.outForDeliveryNotif) {
      await publishEvent({
        eventType: "shipment.out_for_delivery",
        shopId,
        customerId: customerId ?? undefined,
        timestamp: new Date(),
        metadata: { shipmentId: shipment.id, orderId, awb: shipment.awb, carrier: shipment.carrier },
      })
      await db.shipment.update({ where: { id: shipment.id }, data: { outForDeliveryNotif: true } })
    }

    if (latestStatus.status === "delivered") {
      await publishEvent({
        eventType: "shipment.delivered",
        shopId,
        customerId: customerId ?? undefined,
        timestamp: new Date(),
        metadata: {
          shipmentId: shipment.id,
          orderId,
          awb: shipment.awb,
          carrier: shipment.carrier,
          deliveredAt: new Date(),
        },
      })
      await db.order.update({ where: { id: orderId }, data: { status: "delivered", deliveredAt: new Date() } })
    }

    if (latestStatus.status === "failed_delivery") {
      await publishEvent({
        eventType: "shipment.failed_delivery",
        shopId,
        customerId: customerId ?? undefined,
        timestamp: new Date(),
        metadata: { shipmentId: shipment.id, orderId, awb: shipment.awb },
      })
    }

    if (latestStatus.status === "rto_initiated") {
      await publishEvent({
        eventType: "shipment.rto_initiated",
        shopId,
        customerId: customerId ?? undefined,
        timestamp: new Date(),
        metadata: { shipmentId: shipment.id, orderId, awb: shipment.awb },
      })
    }
  }

  if (isNowStuck && !shipment.stuckNotifSent) {
    await publishEvent({
      eventType: "shipment.stuck",
      shopId,
      customerId: customerId ?? undefined,
      timestamp: new Date(),
      metadata: { shipmentId: shipment.id, orderId, hoursSinceLastScan },
    })
    await db.shipment.update({ where: { id: shipment.id }, data: { stuckNotifSent: true } })
  }
}

// Stub: replace with real carrier API calls (Shiprocket, Delhivery, etc.)
async function fetchCarrierStatus(
  carrier: string,
  awb: string
): Promise<{ status: string; rawStatus: string; scannedAt?: Date } | null> {
  void carrier
  void awb
  // In production: carrier-specific API call
  // Shiprocket: GET /v1/external/courier/track/awb/{awb}
  // Delhivery: GET /api/v1/packages/json/?waybill={awb}
  return null
}
