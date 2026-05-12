// WhatsApp Cloud API (Meta) + WATI fallback

interface CloudAPIMessage {
  to: string          // full number with country code: 919876543210
  templateName: string
  languageCode?: string
  components?: CloudAPIComponent[]
}

interface CloudAPIComponent {
  type: "body" | "header" | "button"
  parameters: Array<{ type: "text"; text: string }>
}

interface WAResult {
  success: boolean
  messageId?: string
  error?: string
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return `91${digits}`
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`
  return digits
}

// ─── Meta WhatsApp Cloud API ───────────────────────────────────────────────

export async function sendWhatsAppTemplate(params: {
  phone: string
  templateName: string
  languageCode?: string
  bodyParams?: string[]
  headerParams?: string[]
  phoneNumberId?: string
  accessToken?: string
}): Promise<WAResult> {
  const phoneNumberId = params.phoneNumberId ?? process.env.WA_PHONE_NUMBER_ID
  const accessToken   = params.accessToken   ?? process.env.WA_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: "WhatsApp credentials not configured" }
  }

  const to = normalizePhone(params.phone)

  const components: CloudAPIComponent[] = []

  if (params.headerParams?.length) {
    components.push({
      type: "header",
      parameters: params.headerParams.map(t => ({ type: "text", text: t })),
    })
  }

  if (params.bodyParams?.length) {
    components.push({
      type: "body",
      parameters: params.bodyParams.map(t => ({ type: "text", text: t })),
    })
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: params.templateName,
            language: { code: params.languageCode ?? "en_US" },
            components: components.length ? components : undefined,
          },
        }),
      }
    )

    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } }

    if (!res.ok || data.error) {
      return { success: false, error: data.error?.message ?? "Unknown error" }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}

export async function sendWhatsAppText(params: {
  phone: string
  body: string
  phoneNumberId?: string
  accessToken?: string
}): Promise<WAResult> {
  const phoneNumberId = params.phoneNumberId ?? process.env.WA_PHONE_NUMBER_ID
  const accessToken   = params.accessToken   ?? process.env.WA_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: "WhatsApp credentials not configured" }
  }

  const to = normalizePhone(params.phone)

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: params.body },
        }),
      }
    )

    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } }

    if (!res.ok || data.error) {
      return { success: false, error: data.error?.message ?? "Unknown error" }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}

// ─── Convenience functions for Pulseback flows ─────────────────────────────

export async function sendCODConfirmation(params: {
  phone: string
  name: string
  orderName: string
  amount: string
  shopWaPhoneNumberId?: string
  shopWaAccessToken?: string
}): Promise<WAResult> {
  return sendWhatsAppTemplate({
    phone: params.phone,
    templateName: "cod_confirmation",
    bodyParams: [params.name, params.orderName, params.amount],
    phoneNumberId: params.shopWaPhoneNumberId,
    accessToken: params.shopWaAccessToken,
  })
}

export async function sendAbandonedCartRecovery(params: {
  phone: string
  name: string
  cartValue: string
  discountCode?: string
  checkoutUrl?: string
  phoneNumberId?: string
  accessToken?: string
}): Promise<WAResult> {
  return sendWhatsAppTemplate({
    phone: params.phone,
    templateName: "abandoned_cart_recovery",
    bodyParams: [
      params.name,
      params.cartValue,
      params.discountCode ?? "SAVE10",
      params.checkoutUrl ?? "",
    ],
    phoneNumberId: params.phoneNumberId,
    accessToken: params.accessToken,
  })
}

export async function sendOrderConfirmation(params: {
  phone: string
  name: string
  orderName: string
  amount: string
  phoneNumberId?: string
  accessToken?: string
}): Promise<WAResult> {
  return sendWhatsAppTemplate({
    phone: params.phone,
    templateName: "order_confirmed",
    bodyParams: [params.name, params.orderName, params.amount],
    phoneNumberId: params.phoneNumberId,
    accessToken: params.accessToken,
  })
}

export async function sendOrderDispatched(params: {
  phone: string
  name: string
  orderName: string
  awb: string
  carrier: string
  phoneNumberId?: string
  accessToken?: string
}): Promise<WAResult> {
  return sendWhatsAppTemplate({
    phone: params.phone,
    templateName: "order_dispatched",
    bodyParams: [params.name, params.orderName, params.awb, params.carrier],
    phoneNumberId: params.phoneNumberId,
    accessToken: params.accessToken,
  })
}
