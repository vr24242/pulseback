import { Worker, type Job } from "bullmq"
import { db } from "@d2c/database"
import { createRedisConnection } from "../redis"
import { queueNdr } from "../queues"
import type { TrackingJobData } from "../queues"
import { getShiprocketToken } from "@d2c/core/shipping/shiprocket"

const TERMINAL_STATUSES = new Set(["delivered", "rto_delivered", "cancelled"])
const STUCK_THRESHOLD_HOURS = 48

async function processTrackingJob(job: Job<TrackingJobData>) {
  const { awb, shipmentId } = job.data

  // Per-AWB or full sweep
  const where = awb
    ? { awb }
    : shipmentId
    ? { id: shipmentId }
    : { status: { notIn: [...TERMINAL_STATUSES] } }

  const shipments = await db.shipment.findMany({
    where,
    select: {
      id: true, awb: true, carrier: true, status: true,
      createdAt: true, lastScannedAt: true,
      isStuck: true, failedAttempts: true, ndrAttempts: true,
      dispatchNotifSent: true, outForDeliveryNotif: true,
      stuckNotifSent: true, failedDeliveryNotif: true, rtoInterventionSent: true,
      order: {
        select: {
          id: true, shopId: true, customerId: true,
          shopifyOrderName: true, paymentMethod: true,
        },
      },
    },
    take: awb || shipmentId ? 1 : 200, // batch size for sweep
  })

  job.log(`Processing ${shipments.length} shipments`)

  for (const shipment of shipments) {
    await trackSingleShipment(shipment)
  }

  return { processed: shipments.length }
}

type ShipmentWithOrder = {
  id: string; awb: string; carrier: string; status: string
  createdAt: Date; lastScannedAt: Date | null
  isStuck: boolean; failedAttempts: number; ndrAttempts: number
  dispatchNotifSent: boolean; outForDeliveryNotif: boolean
  stuckNotifSent: boolean; failedDeliveryNotif: boolean; rtoInterventionSent: boolean
  order: {
    id: string; shopId: string; customerId: string | null
    shopifyOrderName: string; paymentMethod: string
  }
}

async function trackSingleShipment(shipment: ShipmentWithOrder) {
  // Poll Shiprocket (or whichever carrier tracker is wired)
  const shop = await db.shop.findUnique({
    where: { id: shipment.order.shopId },
    select: {
      id: true,
      shiprocketEmail: true,
      shiprocketToken: true,
      shiprocketJwt: true,
      shiprocketJwtExpiresAt: true,
    },
  })
  if (!shop?.shiprocketEmail || !shop?.shiprocketToken) return

  let trackingData: { status: string; rawStatus: string; deliveredAt?: Date } | null = null

  try {
    // Use cached JWT if it exists and won't expire within 1 hour
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
    const hasFreshToken =
      shop.shiprocketJwt &&
      shop.shiprocketJwtExpiresAt &&
      shop.shiprocketJwtExpiresAt > oneHourFromNow

    let jwtToken: string
    if (hasFreshToken) {
      jwtToken = shop.shiprocketJwt as string
    } else {
      jwtToken = await getShiprocketToken(shop.shiprocketEmail, shop.shiprocketToken)
      // Update DB with fresh token
      await db.shop.update({
        where: { id: shop.id },
        data: {
          shiprocketJwt: jwtToken,
          shiprocketJwtExpiresAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000), // 9 days (conservative)
        },
      })
    }

    trackingData = await fetchShiprocketStatus(shipment.awb, jwtToken)
  } catch (err) {
    console.error(`[tracking] Failed to fetch ${shipment.awb}:`, err)
    return
  }

  if (!trackingData) return

  const now = new Date()
  const hoursSinceLastScan = shipment.lastScannedAt
    ? (now.getTime() - shipment.lastScannedAt.getTime()) / 3_600_000
    : Infinity

  const isNowStuck =
    !TERMINAL_STATUSES.has(trackingData.status) &&
    hoursSinceLastScan > STUCK_THRESHOLD_HOURS

  // Update shipment record
  await db.shipment.update({
    where: { id: shipment.id },
    data: {
      status: trackingData.status,
      rawStatus: trackingData.rawStatus,
      lastScannedAt: now,
      deliveredAt: trackingData.deliveredAt,
      isStuck: isNowStuck,
      stuckSince: isNowStuck && !shipment.isStuck ? now : undefined,
      rtoInitiatedAt:
        trackingData.status === "rto_initiated" ? now : undefined,
      rtoDeliveredAt:
        trackingData.status === "rto_delivered" ? now : undefined,
    },
  })

  const { customerId, shopId } = shipment.order

  // ── Handle terminal: delivered ──
  if (trackingData.status === "delivered" && shipment.status !== "delivered") {
    await db.order.updateMany({
      where: { shipments: { some: { id: shipment.id } } },
      data: { status: "delivered", deliveredAt: now, isRTO: false },
    })
    if (customerId) {
      await db.customer.update({
        where: { id: customerId },
        data: { lastSeenAt: now },
      })
    }
  }

  // ── Handle terminal: RTO ──
  if (
    (trackingData.status === "rto_initiated" || trackingData.status === "rto_delivered") &&
    !["rto_initiated", "rto_delivered"].includes(shipment.status)
  ) {
    await db.order.updateMany({
      where: { shipments: { some: { id: shipment.id } } },
      data: { status: "returned", isRTO: true, rtoReason: "carrier_returned" },
    })
    if (customerId) {
      // Nudge RTO score upward
      const customer = await db.customer.findUnique({
        where: { id: customerId }, select: { rtoRiskScore: true },
      })
      if (customer) {
        await db.customer.update({
          where: { id: customerId },
          data: { rtoRiskScore: Math.min(100, customer.rtoRiskScore + 10) },
        })
      }
    }
  }

  // ── Handle newly stuck shipment ──
  if (isNowStuck && !shipment.isStuck && customerId) {
    await queueNdr({ shipmentId: shipment.id })
  }
}

async function fetchShiprocketStatus(
  awb: string,
  token: string
): Promise<{ status: string; rawStatus: string; deliveredAt?: Date } | null> {
  const res = await fetch(
    `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  )
  if (!res.ok) return null

  const data = await res.json() as {
    tracking_data?: {
      shipment_status?: number
      shipment_track?: Array<{ current_status: string; updated?: string }>
    }
  }

  const track = data.tracking_data
  if (!track) return null

  const currentStatus = track.shipment_track?.[0]?.current_status ?? ""
  const normalized = normalizeShiprocketStatus(track.shipment_status ?? 0, currentStatus)

  let deliveredAt: Date | undefined
  if (normalized === "delivered" && track.shipment_track?.[0]?.updated) {
    deliveredAt = new Date(track.shipment_track[0].updated)
  }

  return { status: normalized, rawStatus: currentStatus, deliveredAt }
}

function normalizeShiprocketStatus(code: number, raw: string): string {
  const r = raw.toLowerCase()
  if (r.includes("delivered") && !r.includes("rto") && !r.includes("return")) return "delivered"
  if (r.includes("rto") && r.includes("delivered")) return "rto_delivered"
  if (r.includes("rto") || r.includes("return to origin")) return "rto_initiated"
  if (r.includes("out for delivery")) return "out_for_delivery"
  if (r.includes("failed") || r.includes("undelivered")) return "failed_delivery"
  if (r.includes("in transit") || r.includes("in-transit")) return "in_transit"
  if (r.includes("picked up") || r.includes("pickup")) return "in_transit"
  if (code >= 7 && code <= 9) return "delivered"
  if (code === 10) return "rto_initiated"
  return "in_transit"
}

// ─── Worker Export ────────────────────────────────────────────────────────────

export function startTrackingWorker() {
  const worker = new Worker<TrackingJobData>(
    "tracking",
    processTrackingJob,
    {
      connection: createRedisConnection(),
      concurrency: 5,
    }
  )

  worker.on("completed", (job, result) => {
    console.log(`[tracking] ✓ processed ${result.processed} shipments`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[tracking] ✗ ${job?.id} — ${err.message}`)
  })

  return worker
}
