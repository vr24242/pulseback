import { Worker, type Job } from "bullmq"
import { db } from "@d2c/database"
import { createRedisConnection } from "../redis"
import type { CommunicationJobData } from "../queues"
import { sendWhatsAppText, sendWhatsAppTemplate } from "../../communication/whatsapp"

const QUIET_HOURS = { start: 22, end: 8 }
const FREQUENCY_CAPS: Record<string, number> = {
  whatsapp: 6,   // hours between marketing messages
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

async function processCommunicationJob(job: Job<CommunicationJobData>) {
  const data = job.data
  const { shopId, customerId, phone, channel, triggerType, triggerRef } = data

  // Load shop config for WhatsApp credentials
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true,
      waPhoneNumberId: true, waAccessToken: true,
      twilioAccountSid: true, twilioAuthToken: true, twilioPhone: true,
    },
  })
  if (!shop) throw new Error(`Shop ${shopId} not found`)

  const isTransactional = TRANSACTIONAL_TRIGGERS.has(triggerType)

  // Quiet hours check (marketing only)
  if (!isTransactional && isQuietHours()) {
    job.log(`Skipping — quiet hours. Will retry at next schedule.`)
    // Re-queue for 8am rather than just dropping
    const delay = msUntilMorning()
    await job.moveToDelayed(Date.now() + delay)
    return { skipped: true, reason: "quiet_hours" }
  }

  // Frequency cap check (marketing only)
  if (!isTransactional) {
    const capped = await isFrequencyCapped(customerId, channel)
    if (capped) {
      job.log(`Frequency cap hit for ${customerId} on ${channel}`)
      return { skipped: true, reason: "frequency_cap" }
    }
  }

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
    throw err // let BullMQ retry
  }

  // Log to Communications table
  await db.communication.create({
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

  return { success, messageId, channel }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isFrequencyCapped(customerId: string, channel: string): Promise<boolean> {
  const capHours = FREQUENCY_CAPS[channel] ?? 6
  const since = new Date(Date.now() - capHours * 3_600_000)
  const count = await db.communication.count({
    where: {
      customerId,
      channel,
      direction: "outbound",
      status: { in: ["sent", "delivered"] },
      sentAt: { gte: since },
    },
  })
  return count > 0
}

function isQuietHours(): boolean {
  const hour = new Date().getHours()
  return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end
}

function msUntilMorning(): number {
  const now = new Date()
  const morning = new Date()
  if (now.getHours() >= QUIET_HOURS.start) morning.setDate(morning.getDate() + 1)
  morning.setHours(QUIET_HOURS.end, 0, 0, 0)
  return morning.getTime() - now.getTime()
}

async function sendTwilioSMS(opts: {
  to: string; body: string; accountSid: string; authToken: string; from: string
}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`
  const creds = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64")
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: opts.to, From: opts.from, Body: opts.body }),
  })
}

// ─── Worker Export ────────────────────────────────────────────────────────────

export function startCommunicationWorker() {
  const worker = new Worker<CommunicationJobData>(
    "communication",
    processCommunicationJob,
    {
      connection: createRedisConnection(),
      concurrency: 30,  // 30 parallel sends, well within WhatsApp rate limits
      limiter: {
        max: 30,
        duration: 1000, // max 30 jobs/second globally
      },
    }
  )

  worker.on("completed", (job) => {
    console.log(`[comms] ✓ ${job.id} — ${job.data.triggerType} to ${job.data.phone}`)
  })
  worker.on("failed", (job, err) => {
    console.error(`[comms] ✗ ${job?.id} — ${err.message}`)
  })

  return worker
}
