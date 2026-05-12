// WhatsApp messaging — supports AiSensy, WATI, and Meta Cloud API
// For Indian D2C: AiSensy is recommended (live in 2-4 hrs, no Meta verification)

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

// ─── AiSensy ──────────────────────────────────────────────────────────────────
// Sign up: https://aisensy.com — get API key + campaign name from dashboard
// Docs: https://docs.aisensy.com/

async function sendViaAiSensy(params: {
  phone: string
  templateName: string
  bodyParams: string[]
  apiKey: string
}): Promise<WAResult> {
  const to = normalizePhone(params.phone)
  try {
    const res = await fetch("https://backend.aisensy.com/campaign/t1/api/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: params.apiKey,
        campaignName: params.templateName,
        destination: to,
        userName: "Pulseback",
        templateParams: params.bodyParams,
        source: "pulseback",
        media: {},
        buttons: [],
        carouselCards: [],
        location: {},
      }),
    })
    const data = await res.json() as { success?: boolean; messageId?: string; message?: string }
    if (!res.ok) return { success: false, error: data.message ?? "AiSensy error" }
    return { success: true, messageId: data.messageId }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}

// ─── WATI ─────────────────────────────────────────────────────────────────────
// Sign up: https://wati.io — get API URL + token from account settings

async function sendViaWATI(params: {
  phone: string
  templateName: string
  bodyParams: string[]
  apiUrl: string
  token: string
}): Promise<WAResult> {
  const to = normalizePhone(params.phone)
  try {
    const res = await fetch(
      `${params.apiUrl}/api/v1/sendTemplateMessage?whatsappNumber=${to}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_name: params.templateName,
          broadcast_name: params.templateName,
          parameters: params.bodyParams.map(v => ({ name: "text", text: v })),
        }),
      }
    )
    const data = await res.json() as { id?: string; message?: string }
    if (!res.ok) return { success: false, error: data.message ?? "WATI error" }
    return { success: true, messageId: data.id }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}

// ─── Meta Cloud API ──────────────────────────────────────────────────────────
// Requires Meta Business Verification (takes 1-7 days)
// Use AiSensy/WATI for faster setup

async function sendViaMetaCloud(params: {
  phone: string
  templateName: string
  bodyParams?: string[]
  phoneNumberId: string
  accessToken: string
  languageCode?: string
}): Promise<WAResult> {
  const to = normalizePhone(params.phone)
  try {
    const components = params.bodyParams?.length
      ? [{ type: "body", parameters: params.bodyParams.map(t => ({ type: "text", text: t })) }]
      : []

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${params.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
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
    if (!res.ok || data.error) return { success: false, error: data.error?.message ?? "Meta error" }
    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}

// ─── Universal sender — picks provider based on shop config ─────────────────

interface ShopWAConfig {
  aiSensyApiKey?: string | null
  watiApiToken?: string | null
  watiApiUrl?: string | null       // e.g. https://live-server-12345.wati.io
  waPhoneNumberId?: string | null  // Meta Cloud API
  waAccessToken?: string | null    // Meta Cloud API
}

export async function sendWhatsAppTemplate(params: {
  phone: string
  templateName: string
  bodyParams?: string[]
  shopConfig?: ShopWAConfig
}): Promise<WAResult> {
  const cfg = params.shopConfig ?? {}

  // Priority: AiSensy → WATI → Meta Cloud API → env fallback
  if (cfg.aiSensyApiKey) {
    return sendViaAiSensy({
      phone: params.phone,
      templateName: params.templateName,
      bodyParams: params.bodyParams ?? [],
      apiKey: cfg.aiSensyApiKey,
    })
  }

  if (cfg.watiApiToken && cfg.watiApiUrl) {
    return sendViaWATI({
      phone: params.phone,
      templateName: params.templateName,
      bodyParams: params.bodyParams ?? [],
      apiUrl: cfg.watiApiUrl,
      token: cfg.watiApiToken,
    })
  }

  const phoneNumberId = cfg.waPhoneNumberId ?? process.env.WA_PHONE_NUMBER_ID
  const accessToken   = cfg.waAccessToken   ?? process.env.WA_ACCESS_TOKEN
  if (phoneNumberId && accessToken) {
    return sendViaMetaCloud({
      phone: params.phone,
      templateName: params.templateName,
      bodyParams: params.bodyParams,
      phoneNumberId,
      accessToken,
    })
  }

  // Env-level AiSensy fallback
  const envAiSensy = process.env.AISENSY_API_KEY
  if (envAiSensy) {
    return sendViaAiSensy({
      phone: params.phone,
      templateName: params.templateName,
      bodyParams: params.bodyParams ?? [],
      apiKey: envAiSensy,
    })
  }

  console.warn("[whatsapp] No provider configured for shop")
  return { success: false, error: "No WhatsApp provider configured" }
}

export async function sendWhatsAppText(params: {
  phone: string
  body: string
  shopConfig?: ShopWAConfig
}): Promise<WAResult> {
  const cfg = params.shopConfig ?? {}
  const to = normalizePhone(params.phone)

  // Text messages only supported on Meta Cloud API
  const phoneNumberId = cfg.waPhoneNumberId ?? process.env.WA_PHONE_NUMBER_ID
  const accessToken   = cfg.waAccessToken   ?? process.env.WA_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: "Text messages require Meta Cloud API credentials" }
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
          type: "text",
          text: { body: params.body },
        }),
      }
    )
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } }
    if (!res.ok || data.error) return { success: false, error: data.error?.message }
    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}

// ─── Convenience wrappers ────────────────────────────────────────────────────

export async function sendCODConfirmation(params: {
  phone: string
  name: string
  orderName: string
  amount: string
  shopConfig?: ShopWAConfig
}): Promise<WAResult> {
  return sendWhatsAppTemplate({
    phone: params.phone,
    templateName: "cod_confirmation",
    bodyParams: [params.name, params.orderName, params.amount],
    shopConfig: params.shopConfig,
  })
}

export async function sendAbandonedCartRecovery(params: {
  phone: string
  name: string
  cartValue: string
  discountCode?: string
  shopConfig?: ShopWAConfig
}): Promise<WAResult> {
  return sendWhatsAppTemplate({
    phone: params.phone,
    templateName: "abandoned_cart_recovery",
    bodyParams: [params.name, params.cartValue, params.discountCode ?? "SAVE10"],
    shopConfig: params.shopConfig,
  })
}

export async function sendOrderConfirmation(params: {
  phone: string
  name: string
  orderName: string
  amount: string
  shopConfig?: ShopWAConfig
}): Promise<WAResult> {
  return sendWhatsAppTemplate({
    phone: params.phone,
    templateName: "order_confirmed",
    bodyParams: [params.name, params.orderName, params.amount],
    shopConfig: params.shopConfig,
  })
}

export async function sendOrderDispatched(params: {
  phone: string
  name: string
  orderName: string
  awb: string
  carrier: string
  shopConfig?: ShopWAConfig
}): Promise<WAResult> {
  return sendWhatsAppTemplate({
    phone: params.phone,
    templateName: "order_dispatched",
    bodyParams: [params.name, params.orderName, params.awb, params.carrier],
    shopConfig: params.shopConfig,
  })
}
