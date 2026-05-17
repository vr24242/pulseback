import { Worker, type Job } from "bullmq"
import { db } from "@d2c/database"
import { createRedisConnection } from "../redis"
import { queueCommunication } from "../queues"
import type { NdrJobData } from "../queues"
import { getCustomerMemory, decideNDR, CalendarAgent } from "../../agents"
import { getShiprocket } from "../../shipping/shiprocket-mcp.server"
import { AgentOrchestrator, type AgentProposal, AgentDomain, DecisionAction } from "../../orchestrator"
import { recordOutcome } from "../../learning/feedback-loop"

const MAX_NDR_ATTEMPTS = 3
const NDR_COOLDOWN_HOURS = 6

async function processNdrJob(job: Job<NdrJobData>) {
  const { shipmentId } = job.data
  const cooldownCutoff = new Date(Date.now() - NDR_COOLDOWN_HOURS * 3_600_000)

  const shipments = await db.shipment.findMany({
    where: shipmentId
      ? { id: shipmentId }
      : {
          isStuck: true,
          ndrAttempts: { lt: MAX_NDR_ATTEMPTS },
          OR: [
            { lastNdrAt: null },
            { lastNdrAt: { lt: cooldownCutoff } },
          ],
          status: { notIn: ["delivered", "rto_delivered", "cancelled"] },
        },
    select: {
      id: true, awb: true, carrier: true, ndrAttempts: true, failedAttempts: true,
      createdAt: true,
      order: {
        select: {
          id: true, shopId: true, shopifyOrderName: true,
          customerId: true,
          customer: {
            select: { id: true, name: true, phone: true },
          },
        },
      },
    },
    take: 50,
  })

  job.log(`NDR sweep: ${shipments.length} stuck shipments`)

  const redisClient = createRedisConnection()
  const calendar = new CalendarAgent(redisClient)

  // Initialize Shiprocket MCP for logistics intelligence
  let shiprocket
  try {
    shiprocket = await getShiprocket()
  } catch (error) {
    job.log(`[ndr] Warning: Shiprocket MCP initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`)
  }

  for (const shipment of shipments) {
    const { order } = shipment
    const customer = order.customer
    if (!customer?.phone) continue

    // Load customer context
    const memory = await getCustomerMemory(customer.id)

    // Get pincode intelligence from Shiprocket (if available)
    let pincodeIntelligence
    if (shiprocket && shipment.awb) {
      try {
        const trackingHistory = await shiprocket.getShipmentHistory(shipment.awb)
        const lastEvent = trackingHistory[trackingHistory.length - 1]

        // Extract pincode from tracking event if available
        const pincode = lastEvent?.pincode || order.id?.substring(0, 5)
        if (pincode) {
          pincodeIntelligence = await shiprocket.getPincodeIntelligence(pincode)
        }
      } catch (error) {
        // Continue without pincode intel
      }
    }

    // Decide what to do with this shipment
    const decision = await decideNDR(memory, {
      orderId: order.id,
      awbNumber: shipment.awb,
      failedAttempts: shipment.failedAttempts,
      lastAttemptAt: shipment.createdAt,
      daysInTransit: Math.floor((Date.now() - shipment.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      isStuck: true,
      lastTrackingEvent: undefined,
      pincodeRTORate: pincodeIntelligence?.rto_rate,
      bestCourierInPincode: pincodeIntelligence?.best_courier,
    })

    job.log(`[ndr] Shipment ${shipment.awb} — decision: ${decision.action} (${decision.reasoning})`)

    // ──────────────────────────────────────────────────────────────────────────────
    // ORCHESTRATOR INTEGRATION (Phase 5)
    // ──────────────────────────────────────────────────────────────────────────────

    // Create proposal for orchestrator coordination
    const proposal: AgentProposal = {
      agentDomain: AgentDomain.Logistics,
      agentName: "ndr",
      customerId: customer.id,
      action: DecisionAction.SendMessage,
      reasoning: `NDR attempt ${shipment.ndrAttempts + 1}. Stuck ${Math.floor((Date.now() - shipment.createdAt.getTime()) / (1000 * 60 * 60 * 24))} days. Failed attempts: ${shipment.failedAttempts}. Intent: ${decision.messageIntent}`,
      context: {
        shipmentId: shipment.id,
        awb: shipment.awb,
        orderId: order.id,
        ndrAttempt: shipment.ndrAttempts + 1,
        daysInTransit: Math.floor((Date.now() - shipment.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        action: decision.action,
      },
      confidence: 85, // logistics decisions have high confidence
      priority: "high", // logistics > marketing
      retryable: true,
      idempotencyKey: `ndr-${shipment.id}-attempt${shipment.ndrAttempts + 1}`,
    }

    // Get orchestrator approval
    const orchestratorDecision = await AgentOrchestrator.propose(proposal, memory)

    if (!orchestratorDecision.approved) {
      job.log(`[ndr] Shipment ${shipment.awb} — orchestrator rejected: ${orchestratorDecision.reason}`)
      continue
    }

    // Execute orchestrator decision
    const outcome = await AgentOrchestrator.execute(proposal, orchestratorDecision)

    // Execute decision
    if (decision.action === "send_wa") {
      const message = buildNdrMessage(
        customer.name,
        order.shopifyOrderName,
        shipment.ndrAttempts + 1,
        shipment.carrier
      )

      await queueCommunication({
        shopId: order.shopId,
        customerId: customer.id,
        phone: customer.phone,
        channel: "whatsapp",
        body: message,
        triggerType: "ndr_reattempt",
        triggerRef: shipment.id,
        priority: "high",
      })

      await calendar.recordSent(customer.id, "ndr")

      await db.shipment.update({
        where: { id: shipment.id },
        data: {
          lastNdrAt: new Date(),
          ndrAttempts: { increment: 1 },
        },
      })

      // Record outcome for learning loop
      await recordOutcome(outcome.proposalId, "success", {
        shipmentId: shipment.id,
        awb: shipment.awb,
        ndrAttempt: shipment.ndrAttempts + 1,
        sentAt: new Date(),
        channel: "whatsapp",
      })

      if (order.customerId) {
        await db.timelineEvent.create({
          data: {
            customerId: order.customerId,
            shopId: order.shopId,
            eventType: "ndr_sent",
            title: `NDR attempt ${shipment.ndrAttempts + 1}: ${decision.messageIntent}`,
            metadata: { shipmentId: shipment.id, awb: shipment.awb, reasoning: decision.reasoning, proposalId: outcome.proposalId },
          },
        })
      }
    } else if (decision.action === "request_address_update") {
      // Queue address update prompt
      const message = `Hi ${customer.name?.split(" ")[0]}, we couldn't reach you at the address on file for *${order.shopifyOrderName}*. Could you reply with a corrected address so we can redeliver?`

      await queueCommunication({
        shopId: order.shopId,
        customerId: customer.id,
        phone: customer.phone,
        channel: "whatsapp",
        body: message,
        triggerType: "ndr_address_update",
        triggerRef: shipment.id,
        priority: "high",
      })

      await db.shipment.update({
        where: { id: shipment.id },
        data: { lastNdrAt: new Date(), ndrAttempts: { increment: 1 } },
      })
    } else if (decision.action === "initiate_rto") {
      // Mark for RTO initiation
      await db.shipment.update({
        where: { id: shipment.id },
        data: { status: "rto_initiated", rtoInitiatedAt: new Date() },
      })

      if (order.customerId) {
        await db.timelineEvent.create({
          data: {
            customerId: order.customerId,
            shopId: order.shopId,
            eventType: "rto_initiated",
            title: `RTO initiated for ${order.shopifyOrderName}`,
            metadata: { reason: decision.reasoning },
          },
        })
      }
    } else if (decision.action === "escalate_merchant") {
      // Queue notification to merchant via WA
      const ownerData = await db.shop.findUnique({
        where: { id: order.shopId },
        select: { ownerPhone: true, id: true },
      })

      if (ownerData?.ownerPhone) {
        // Create a dummy customer for merchant messages (use shop ID as customer)
        let merchantCustomerId = await db.customer.findFirst({
          where: { shopId: order.shopId, phone: ownerData.ownerPhone },
          select: { id: true },
        })

        if (!merchantCustomerId) {
          const created = await db.customer.create({
            data: {
              shopId: order.shopId,
              phone: ownerData.ownerPhone,
              name: "Merchant",
            },
          })
          merchantCustomerId = { id: created.id }
        }

        await queueCommunication({
          shopId: order.shopId,
          customerId: merchantCustomerId.id,
          phone: ownerData.ownerPhone,
          channel: "whatsapp",
          body: `⚠️ NDR escalation: ${order.shopifyOrderName} — ${shipment.ndrAttempts + 1} failed attempts. ${decision.reasoning}`,
          triggerType: "ndr_merchant_alert",
          triggerRef: shipment.id,
          priority: "high",
        })
      }
    }
  }

  return { processed: shipments.length }
}

function buildNdrMessage(
  name: string | null,
  orderName: string,
  attempt: number,
  carrier: string
): string {
  const firstName = name?.split(" ")[0] ?? "there"
  const carrierLabel = carrier.charAt(0).toUpperCase() + carrier.slice(1)

  if (attempt === 1) {
    return (
      `Hi ${firstName}! 👋 Our delivery partner ${carrierLabel} tried to deliver your order *${orderName}* but couldn't reach you.\n\n` +
      `Reply *1* to schedule a reattempt\n` +
      `Reply *2* to cancel the order\n\n` +
      `We'll hold it for 48 hours.`
    )
  }

  if (attempt === 2) {
    return (
      `Hi ${firstName}, this is our 2nd attempt to deliver *${orderName}*. We don't want you to miss it! 📦\n\n` +
      `Reply *1* if you'd like us to try again\n` +
      `Reply *2* to cancel\n\n` +
      `If we don't hear back, we'll return it in 24 hours.`
    )
  }

  return (
    `Hi ${firstName}, last chance! ⚠️ Your order *${orderName}* will be returned to us tomorrow if we can't deliver it.\n\n` +
    `Reply *1* to confirm delivery — we'll make one final attempt\n` +
    `Reply *2* to cancel and get a refund`
  )
}

// ─── Worker Export ────────────────────────────────────────────────────────────

export function startNdrWorker() {
  const worker = new Worker<NdrJobData>(
    "ndr",
    processNdrJob,
    {
      connection: createRedisConnection(),
      concurrency: 3,
    }
  )

  worker.on("completed", (job, result) => {
    console.log(`[ndr] ✓ processed ${result.processed} stuck shipments`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[ndr] ✗ ${job?.id} — ${err.message}`)
  })

  return worker
}
