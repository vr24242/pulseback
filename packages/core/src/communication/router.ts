import { db } from "@d2c/database"
import type { Channel, TriggerType, MessagePayload, CommunicationResult } from "@d2c/shared"
import { sendWhatsAppTemplate } from "./whatsapp"

const QUIET_HOURS = { start: 22, end: 8 } // 10pm - 8am local time

// Frequency caps per channel (hours between messages)
const FREQUENCY_CAPS: Record<Channel, number> = {
  whatsapp: 6,
  email: 24,
  sms: 12,
}

export async function sendMessage(
  customerId: string,
  shopId: string,
  trigger: TriggerType,
  payload: MessagePayload,
  triggerRef?: string
): Promise<CommunicationResult> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      phone: true,
      email: true,
      whatsappOptIn: true,
      emailOptIn: true,
      smsOptIn: true,
    },
  })

  if (!customer) return { success: false, error: "Customer not found", channel: payload.channel }

  // Check consent
  if (payload.channel === "whatsapp" && !customer.whatsappOptIn) {
    return { success: false, error: "WhatsApp opt-out", channel: "whatsapp" }
  }
  if (payload.channel === "email" && !customer.emailOptIn) {
    return { success: false, error: "Email opt-out", channel: "email" }
  }

  // Check frequency cap
  const isCapped = await isFrequencyCapped(customerId, payload.channel)
  if (isCapped) return { success: false, error: "Frequency cap hit", channel: payload.channel }

  // Check quiet hours
  if (isQuietHours()) {
    // Schedule for next morning instead (8am)
    const scheduledFor = nextMorning()
    await db.communication.create({
      data: {
        shopId,
        customerId,
        channel: payload.channel,
        direction: "outbound",
        templateName: payload.templateName,
        subject: payload.subject,
        body: payload.body,
        triggerType: trigger,
        triggerRef,
        status: "queued",
        queuedAt: new Date(),
        sentAt: scheduledFor,
      },
    })
    return { success: true, channel: payload.channel }
  }

  // Send
  let result: CommunicationResult = { success: false, channel: payload.channel }

  if (payload.channel === "whatsapp" && customer.phone && payload.templateName) {
    const watiResult = await sendWhatsAppTemplate({
      phone: customer.phone,
      templateName: payload.templateName,
      variables: (payload.variables as Record<string, string>) ?? {},
    })
    result = { success: watiResult.result, messageId: watiResult.messageId, channel: "whatsapp" }
  }

  // Log the communication
  await db.communication.create({
    data: {
      shopId,
      customerId,
      channel: payload.channel,
      direction: "outbound",
      templateName: payload.templateName,
      subject: payload.subject,
      body: payload.body,
      triggerType: trigger,
      triggerRef,
      status: result.success ? "sent" : "failed",
      sentAt: result.success ? new Date() : undefined,
      messageId: result.messageId,
    },
  })

  return result
}

async function isFrequencyCapped(customerId: string, channel: Channel): Promise<boolean> {
  const capHours = FREQUENCY_CAPS[channel]
  const since = new Date(Date.now() - capHours * 60 * 60 * 1000)

  const recent = await db.communication.count({
    where: {
      customerId,
      channel,
      direction: "outbound",
      status: { in: ["sent", "delivered"] },
      sentAt: { gte: since },
    },
  })

  return recent > 0
}

function isQuietHours(): boolean {
  const hour = new Date().getHours()
  return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end
}

function nextMorning(): Date {
  const d = new Date()
  d.setDate(d.getDate() + (d.getHours() >= QUIET_HOURS.start ? 1 : 0))
  d.setHours(QUIET_HOURS.end, 0, 0, 0)
  return d
}
