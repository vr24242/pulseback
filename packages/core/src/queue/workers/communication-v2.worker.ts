/**
 * COMMUNICATION WORKER V2 — With Orchestrator Integration
 *
 * This is the updated version that coordinates with AgentOrchestrator.
 * All messages go through the orchestrator for:
 * - Conflict resolution (no double messaging)
 * - Calendar coordination (frequency caps, quiet hours, pending issues)
 * - Outcome tracking (for learning loop)
 *
 * Replaces: communication.worker.ts
 * Integration pattern for other workers to follow.
 */

import { Worker, type Job } from "bullmq"
import { db } from "@d2c/database"
import { createRedisConnection } from "../redis"
import { getCustomerMemory } from "../agents/customer-memory"
import { AgentOrchestrator, type AgentProposal, AgentDomain, DecisionAction } from "../orchestrator"
import { recordOutcome } from "../learning/feedback-loop"
import type { CommunicationJobData } from "../queues"
import { sendWhatsAppText, sendWhatsAppTemplate } from "../../communication/whatsapp"

const QUIET_HOURS = { start: 22, end: 8 }
const FREQUENCY_CAPS: Record<string, number> = {
  whatsapp: 6, // hours between marketing messages
  sms: 12,
}

// Transactional triggers bypass frequency cap and quiet hours
const TRANSACTIONAL_TRIGGERS = new Set([
  "cod_confirmation",
  "order_confirmed",
  "order_dispatched",
  "otp",
  "ndr_reattempt",
  "cod_to_prepaid",
  "return_confirmed",
])

async function processCommunicationJobV2(job: Job<CommunicationJobData>) {
  const data = job.data
  const { shopId, customerId, phone, channel, triggerType, triggerRef } = data
  const isTransactional = TRANSACTIONAL_TRIGGERS.has(triggerType)

  // Load shop config
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      aiSensyApiKey: true,
      watiApiToken: true,
      watiPhoneNumber: true,
      waPhoneNumberId: true,
      waAccessToken: true,
      twilioAccountSid: true,
      twilioAuthToken: true,
      twilioPhone: true,
    },
  })
  if (!shop) throw new Error(`Shop ${shopId} not found`)

  // ──────────────────────────────────────────────────────────────────────────────
  // PHASE 5: ORCHESTRATOR INTEGRATION
  // ──────────────────────────────────────────────────────────────────────────────

  // Load customer context for orchestrator evaluation
  const customerMemory = await getCustomerMemory(customerId)
  if (!customerMemory) {
    job.log(`Customer ${customerId} not found in memory`)
    return { skipped: true, reason: "customer_not_found" }
  }

  // Determine agent domain based on trigger type
  const agentDomain = determineAgentDomain(triggerType)
  const agentName = determineAgentName(triggerType)

  // Create proposal for orchestrator
  const proposal: AgentProposal = {
    agentDomain,
    agentName,
    customerId,
    action: DecisionAction.SendMessage,
    reasoning: `${triggerType} message to ${phone}. Customer preference: ${customerMemory.preferredLanguage}`,
    context: {
      triggerType,
      triggerRef,
      channel,
      phone,
      templateName: data.templateName,
      isTransactional,
    },
    confidence: isTransactional ? 95 : 70, // transactional = high confidence
    priority: isTransactional ? "high" : "medium",
    retryable: true,
    idempotencyKey: `${shopId}-${customerId}-${triggerType}-${triggerRef}`,
  }

  // Get orchestrator decision
  const orchestratorDecision = await AgentOrchestrator.propose(proposal, customerMemory)

  if (!orchestratorDecision.approved) {
    job.log(`Orchestrator rejected: ${orchestratorDecision.reason}`)

    // If deferred, reschedule for later
    if (orchestratorDecision.executeAt) {
      const delayMs = Math.max(0, orchestratorDecision.executeAt.getTime() - Date.now())
      job.log(`Rescheduling for ${orchestratorDecision.executeAt.toISOString()}`)
      await job.moveToDelayed(Date.now() + delayMs)
    }

    return { skipped: true, reason: "orchestrator_blocked", detail: orchestratorDecision.reason }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // EXECUTE THE APPROVED DECISION
  // ──────────────────────────────────────────────────────────────────────────────

  const shopConfig = {
    aiSensyApiKey: shop.aiSensyApiKey ?? undefined,
    watiApiToken: shop.watiApiToken ?? undefined,
    watiApiUrl: shop.watiPhoneNumber ?? undefined,
    waPhoneNumberId: shop.waPhoneNumberId ?? undefined,
    waAccessToken: shop.waAccessToken ?? undefined,
  }

  let success = false
  let messageId: string | undefined
  let errorMsg: string | undefined

  try {
    if (channel === "whatsapp") {
      if (data.templateName && data.bodyParams) {
        const result = await sendWhatsAppTemplate({
          phone,
          templateName: data.templateName,
          bodyParams: data.bodyParams,
          shopConfig,
        })
        success = result.success
        messageId = result.messageId
      } else if (data.body) {
        await sendWhatsAppText({ phone, body: data.body, shopConfig })
        success = true
      }
    } else if (channel === "sms") {
      if (shop.twilioAccountSid && shop.twilioAuthToken && shop.twilioPhone && data.body) {
        await sendTwilioSMS({
          to: `+91${phone}`,
          body: data.body,
          accountSid: shop.twilioAccountSid,
          authToken: shop.twilioAuthToken,
          from: shop.twilioPhone,
        })
        success = true
      }
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err)
    job.log(`Failed to send: ${errorMsg}`)
    throw err // let BullMQ retry
  }

  // Log to Communications table
  const communication = await db.communication.create({
    data: {
      shopId,
      customerId,
      channel,
      direction: "outbound",
      templateName: data.templateName,
      body: data.body ?? data.templateName ?? "",
      triggerType,
      triggerRef,
      messageId,
      status: success ? "sent" : "failed",
      sentAt: success ? new Date() : undefined,
      failedAt: !success ? new Date() : undefined,
    },
  })

  // ──────────────────────────────────────────────────────────────────────────────
  // ORCHESTRATOR EXECUTION & OUTCOME RECORDING
  // ──────────────────────────────────────────────────────────────────────────────

  const outcome = await AgentOrchestrator.execute(proposal, orchestratorDecision)

  // Record outcome for learning loop
  const outcomeResult = success ? "success" : "failure"
  await recordOutcome(outcome.proposalId, outcomeResult, {
    messageId,
    channel,
    triggerType,
    sentAt: new Date(),
  })

  return { success, messageId, channel, communicationId: communication.id }
}

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

function determineAgentDomain(triggerType: string): AgentDomain {
  // Map trigger types to agent domains
  if (triggerType.includes("ndr") || triggerType.includes("shipment")) return AgentDomain.Logistics
  if (triggerType.includes("support") || triggerType.includes("complaint")) return AgentDomain.Support
  if (triggerType.includes("return")) return AgentDomain.Operations
  if (triggerType.includes("payment") || triggerType.includes("refund")) return AgentDomain.Finance
  return AgentDomain.Marketing // default: marketing/retention
}

function determineAgentName(triggerType: string): string {
  if (triggerType.includes("abandoned_cart")) return "abandoned-cart"
  if (triggerType.includes("ndr")) return "ndr"
  if (triggerType.includes("return")) return "return"
  if (triggerType.includes("winback")) return "winback"
  if (triggerType.includes("broadcast")) return "broadcast"
  return triggerType
}

async function sendTwilioSMS(opts: {
  to: string
  body: string
  accountSid: string
  authToken: string
  from: string
}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`
  const creds = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64")
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: opts.to, From: opts.from, Body: opts.body }),
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// WORKER EXPORT
// ──────────────────────────────────────────────────────────────────────────────

export function startCommunicationWorkerV2() {
  const worker = new Worker<CommunicationJobData>(
    "communication-v2",
    processCommunicationJobV2,
    {
      connection: createRedisConnection(),
      concurrency: 30, // 30 parallel sends
      limiter: {
        max: 30,
        duration: 1000, // max 30 jobs/second globally
      },
    }
  )

  worker.on("completed", (job) => {
    console.log(`[comms-v2] ✓ ${job.id} — ${job.data.triggerType} to ${job.data.phone}`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[comms-v2] ✗ ${job?.id} — ${err.message}`)
  })

  return worker
}

export default startCommunicationWorkerV2
