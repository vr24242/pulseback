import axios from "axios"
import crypto from "crypto"
import { db } from "@d2c/database"

const META_CAPI_URL = "https://graph.facebook.com/v19.0"

interface CAPIEvent {
  event_name: string
  event_time: number
  event_id: string
  user_data: {
    ph?: string[]  // hashed phone(s)
    em?: string[]  // hashed email(s)
    client_ip_address?: string
    client_user_agent?: string
    fbc?: string   // Facebook click ID
    fbp?: string   // Facebook browser ID
  }
  custom_data?: {
    value?: number
    currency?: string
    content_ids?: string[]
    content_type?: string
    order_id?: string
    num_items?: number
  }
  action_source: "website" | "app" | "crm"
}

function hashData(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex")
}

export async function fireMetaEvent(input: {
  shopId: string
  pixelId: string
  accessToken: string
  eventName: string
  customerId?: string
  phone?: string
  email?: string
  value?: number
  currency?: string
  contentIds?: string[]
  orderId?: string
  clientIp?: string
  userAgent?: string
}): Promise<void> {
  const eventId = crypto.randomUUID()
  const eventTime = Math.floor(Date.now() / 1000)

  const userData: CAPIEvent["user_data"] = {}
  if (input.phone) userData.ph = [hashData(input.phone.replace(/\D/g, ""))]
  if (input.email) userData.em = [hashData(input.email)]
  if (input.clientIp) userData.client_ip_address = input.clientIp
  if (input.userAgent) userData.client_user_agent = input.userAgent

  const event: CAPIEvent = {
    event_name: input.eventName,
    event_time: eventTime,
    event_id: eventId,
    user_data: userData,
    action_source: "website",
  }

  if (input.value || input.contentIds || input.orderId) {
    event.custom_data = {
      value: input.value,
      currency: input.currency ?? "INR",
      content_ids: input.contentIds,
      content_type: "product",
      order_id: input.orderId,
      num_items: input.contentIds?.length,
    }
  }

  try {
    await axios.post(
      `${META_CAPI_URL}/${input.pixelId}/events`,
      { data: [event] },
      { params: { access_token: input.accessToken } }
    )

    await db.marketingEvent.create({
      data: {
        shopId: input.shopId,
        customerId: input.customerId,
        platform: "meta",
        eventName: input.eventName,
        eventValue: input.value,
        eventId,
        success: true,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    await db.marketingEvent.create({
      data: {
        shopId: input.shopId,
        customerId: input.customerId,
        platform: "meta",
        eventName: input.eventName,
        eventId,
        success: false,
        error: err?.message,
      },
    })
  }
}
