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

// ── Carrier status fetcher — Shiprocket primary, Delhivery fallback ─────────

async function fetchCarrierStatus(
  carrier: string,
  awb: string
): Promise<{ status: string; rawStatus: string; scannedAt?: Date } | null> {
  // Shiprocket tracks all Indian couriers via one API
  const shiprocketToken = process.env.SHIPROCKET_TOKEN
  if (shiprocketToken) {
    const result = await fetchShiprocketStatus(awb, shiprocketToken)
    if (result) return result
  }

  // Delhivery direct API
  if (carrier === "delhivery") {
    const result = await fetchDelhiveryStatus(awb)
    if (result) return result
  }

  return null
}

// ── Shiprocket tracking ──────────────────────────────────────────────────────
// Docs: https://apiv2.shiprocket.in/v1/external/courier/track/awb/{awb}
// Note: JWT tokens are cached in DB (shop.shiprocketJwt). See tracking.worker.ts for usage.

async function fetchShiprocketStatus(
  awb: string,
  token: string
): Promise<{ status: string; rawStatus: string; scannedAt?: Date } | null> {
  try {
    const res = await fetch(
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return null
    const data = await res.json() as ShiprocketTrackingResponse

    const scan = data.tracking_data?.shipment_track_activities?.[0]
    if (!scan) return null

    const rawStatus = scan.activity ?? "unknown"
    const status = mapShiprocketStatus(rawStatus)
    const scannedAt = scan.date ? new Date(scan.date) : undefined

    return { status, rawStatus, scannedAt }
  } catch {
    return null
  }
}

function mapShiprocketStatus(raw: string): string {
  const r = raw.toLowerCase()
  if (r.includes("delivered") && !r.includes("out for")) return "delivered"
  if (r.includes("out for delivery"))                      return "out_for_delivery"
  if (r.includes("undelivered") || r.includes("failed"))  return "failed_delivery"
  if (r.includes("rto") && r.includes("deliver"))         return "rto_delivered"
  if (r.includes("rto") || r.includes("return"))          return "rto_initiated"
  if (r.includes("pickup") || r.includes("collected"))    return "in_transit"
  if (r.includes("transit") || r.includes("dispatch"))    return "in_transit"
  return "in_transit"
}

// ── Delhivery tracking ───────────────────────────────────────────────────────

async function fetchDelhiveryStatus(
  awb: string
): Promise<{ status: string; rawStatus: string; scannedAt?: Date } | null> {
  const token = process.env.DELHIVERY_TOKEN
  if (!token) return null

  try {
    const res = await fetch(
      `https://track.delhivery.com/api/v1/packages/json/?waybill=${awb}&token=${token}`
    )
    if (!res.ok) return null
    const data = await res.json() as DelhiveryTrackingResponse

    const pkg = data.ShipmentData?.[0]?.Shipment
    if (!pkg) return null

    const rawStatus = pkg.Status?.Status ?? "unknown"
    const status = mapDelhiveryStatus(rawStatus)

    return { status, rawStatus }
  } catch {
    return null
  }
}

function mapDelhiveryStatus(raw: string): string {
  const r = raw.toLowerCase()
  if (r === "delivered")              return "delivered"
  if (r.includes("out for delivery")) return "out_for_delivery"
  if (r.includes("undelivered"))      return "failed_delivery"
  if (r.includes("rto"))              return "rto_initiated"
  return "in_transit"
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ShiprocketTrackingResponse {
  tracking_data?: {
    shipment_track_activities?: Array<{
      activity?: string
      date?: string
      location?: string
    }>
  }
}

interface DelhiveryTrackingResponse {
  ShipmentData?: Array<{
    Shipment?: {
      Status?: { Status?: string; Instructions?: string }
    }
  }>
}
