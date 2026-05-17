import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"
import { sendWhatsAppText, handleSupportMessage } from "@d2c/core"
import { detectLanguage } from "@d2c/core/utils/language"
import Anthropic from "@anthropic-ai/sdk"

const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Intent classification via Haiku (cheap, fast) ────────────────────────────

type Intent =
  | "cod_confirm"        // customer confirming COD order
  | "cod_cancel"         // customer cancelling COD order
  | "wismo"              // where is my order
  | "cancel_order"       // wants to cancel a non-COD order
  | "return_request"     // wants to return/exchange
  | "address_update"     // wants to change delivery address
  | "support"            // general question needing agent

const FAST_INTENT_PATTERNS = {
  cod_confirm: /^(yes|y|1|confirm|ha|haan|ok|okay|haan ji|bilkul)$/i,
  cod_cancel:  /^(no|n|0|cancel|nahi|nai|nope|mat karo)$/i,
}

async function classifyIntent(text: string, sessionContext: string): Promise<Intent> {
  // Fast path — regex for simple yes/no
  if (FAST_INTENT_PATTERNS.cod_confirm.test(text.trim())) return "cod_confirm"
  if (FAST_INTENT_PATTERNS.cod_cancel.test(text.trim())) return "cod_cancel"

  // Haiku for everything else — 12x cheaper than Sonnet for classification
  const response = await haiku.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 50,
    system: `Classify the customer message into one of these intents. Reply with ONLY the intent label.

Intents:
- wismo: asking about order status, shipping, tracking, delivery date
- cancel_order: wants to cancel an order
- return_request: wants to return, exchange, or refund an item
- address_update: wants to change or update delivery address
- support: everything else

Context about the conversation: ${sessionContext}`,
    messages: [{ role: "user", content: text }],
  })

  const raw = (response.content[0] as Anthropic.TextBlock).text.trim().toLowerCase()
  const valid: Intent[] = ["wismo", "cancel_order", "return_request", "address_update", "support"]
  return (valid.find((i) => raw.includes(i)) ?? "support") as Intent
}

// ── Meta webhook verification ─────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const mode      = url.searchParams.get("hub.mode")
  const token     = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")
  if (mode === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return json({ error: "Forbidden" }, { status: 403 })
}

// ── Incoming messages ─────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = await request.json() as MetaWebhookPayload

    const entry  = body.entry?.[0]
    const change = entry?.changes?.[0]
    if (change?.field !== "messages") return json({ ok: true })

    const msg = change.value?.messages?.[0]
    if (!msg || msg.type !== "text") return json({ ok: true })

    const from          = msg.from                            // e.g. "919876543210"
    const text          = (msg.text?.body ?? "").trim()
    const phoneNumberId = change.value?.metadata?.phone_number_id

    if (!from || !text) return json({ ok: true })

    const normalizedPhone = from.replace(/^91/, "").slice(-10)

    // ── Resolve shop by WhatsApp phone number ID ──
    const shop = await db.shop.findFirst({
      where: { waPhoneNumberId: phoneNumberId },
    })
    if (!shop) return json({ ok: true })

    const shopCfg = {
      waPhoneNumberId: phoneNumberId ?? undefined,
      waAccessToken: shop.waAccessToken ?? undefined,
    }

    // ── Resolve customer ──
    const customer = await db.customer.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone: normalizedPhone } },
    })
    if (!customer) {
      // Unknown number — can still answer general questions but can't take actions
      await sendWhatsAppText({
        phone: from,
        body: "Hi! 👋 I couldn't find an account linked to this number. If you placed an order using a different number or email, please contact us at our support email.",
        shopConfig: shopCfg,
      })
      return json({ ok: true })
    }

    // ── Load or create WhatsApp session (24h TTL) ──
    const now = new Date()
    const sessionExpiry = new Date(now.getTime() + 24 * 3_600_000)

    let session = await db.whatsAppSession.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone: normalizedPhone } },
    })

    // If session expired or doesn't exist, start fresh
    if (!session || session.expiresAt < now) {
      session = await db.whatsAppSession.upsert({
        where: { shopId_phone: { shopId: shop.id, phone: normalizedPhone } },
        create: {
          shopId: shop.id,
          phone: normalizedPhone,
          customerId: customer.id,
          currentIntent: null,
          contextJson: {},
          history: [],
          lastMessageAt: now,
          expiresAt: sessionExpiry,
        },
        update: {
          customerId: customer.id,
          currentIntent: null,
          contextJson: {},
          history: [],
          lastMessageAt: now,
          expiresAt: sessionExpiry,
        },
      })
    }

    // ── Detect language (franc — local, <1ms, free) ──
    const lang = detectLanguage(text)

    // ── Build context string for Haiku ──
    const history = session.history as Array<{ role: string; content: string; ts?: string }>
    const sessionContext = history.length > 0
      ? `Recent messages: ${history.slice(-3).map((h) => `${h.role}: ${h.content}`).join(" | ")}`
      : "New conversation"

    // ── Classify intent (Haiku — cheap, fast) ──
    const intent = await classifyIntent(text, sessionContext)

    // ── Log inbound message ──
    await db.communication.create({
      data: {
        shopId: shop.id,
        customerId: customer.id,
        channel: "whatsapp",
        direction: "inbound",
        body: text,
        triggerType: `customer.${intent}`,
        status: "delivered",
        deliveredAt: now,
        replyHandled: true,
      },
    })

    // ── Dispatch based on intent ──
    let reply = ""

    if (intent === "cod_confirm" || intent === "cod_cancel") {
      reply = await handleCodConfirmation(shop.id, customer, intent, from, shopCfg)
    } else if (intent === "wismo") {
      reply = await handleWismo(shop.id, customer, from, shopCfg)
    } else {
      // Complex intent — route to Sonnet with tools via support agent
      // lang.needsSarvam = true when Sarvam AI is wired — agent will respond in customer's language
      const ticket = await findOrCreateTicket(shop.id, customer)
      const result = await handleSupportMessage({
        shopId: shop.id,
        customerId: customer.id,
        ticketId: ticket.id,
        incomingMessage: text,
        conversationHistory: history,
        language: lang.code,           // passed through — Sarvam uses this when available
        needsRegionalLang: lang.needsSarvam,
      })
      reply = result.reply
    }

    // ── Send reply ──
    if (reply) {
      await sendWhatsAppText({ phone: from, body: reply, shopConfig: shopCfg })
    }

    // ── Update session — store language for continuity ──
    const updatedHistory: Array<{ role: string; content: string; ts?: string }> = [
      ...history.slice(-19), // keep last 20 turns
      { role: "customer", content: text, ts: now.toISOString() },
      { role: "agent", content: reply, ts: now.toISOString() },
    ]

    await db.whatsAppSession.update({
      where: { shopId_phone: { shopId: shop.id, phone: normalizedPhone } },
      data: {
        currentIntent: intent,
        contextJson: { language: lang.code, isRegional: lang.isRegional },
        history: updatedHistory,
        lastMessageAt: now,
        expiresAt: sessionExpiry,
      },
    })

    return json({ ok: true })
  } catch (err) {
    console.error("[api/whatsapp/webhook]", err)
    return json({ ok: true })
  }
}

// ── COD Confirmation handler ──────────────────────────────────────────────────

async function handleCodConfirmation(
  shopId: string,
  customer: { id: string; name: string | null },
  intent: "cod_confirm" | "cod_cancel",
  from: string,
  shopCfg: Record<string, string | undefined>
): Promise<string> {
  const codOrder = await db.order.findFirst({
    where: {
      customerId: customer.id,
      paymentMethod: "cod",
      codConfirmationSent: true,
      codConfirmationConfirmed: false,
      status: "placed",
    },
    orderBy: { createdAt: "desc" },
  })

  if (!codOrder) {
    return "I don't see any pending order that needs confirmation. Is there anything else I can help you with?"
  }

  if (intent === "cod_confirm") {
    await db.order.update({
      where: { id: codOrder.id },
      data: { codConfirmationConfirmed: true, status: "confirmed" },
    })
    await db.timelineEvent.create({
      data: {
        customerId: customer.id,
        shopId,
        eventType: "order.confirmed",
        title: `${codOrder.shopifyOrderName} confirmed by customer via WhatsApp`,
        metadata: { orderId: codOrder.id },
      },
    })
    return `✅ Your order ${codOrder.shopifyOrderName} is confirmed! We'll notify you once it's picked up for delivery.`
  } else {
    await db.order.update({
      where: { id: codOrder.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: "customer_cancelled_cod",
      },
    })
    await db.timelineEvent.create({
      data: {
        customerId: customer.id,
        shopId,
        eventType: "order.cancelled",
        title: `${codOrder.shopifyOrderName} cancelled by customer via WhatsApp`,
        metadata: { orderId: codOrder.id },
      },
    })
    return `Your order ${codOrder.shopifyOrderName} has been cancelled. If this was a mistake, you can place a new order anytime. 😊`
  }
}

// ── WISMO handler ─────────────────────────────────────────────────────────────

async function handleWismo(
  shopId: string,
  customer: { id: string; name: string | null },
  from: string,
  shopCfg: Record<string, string | undefined>
): Promise<string> {
  const order = await db.order.findFirst({
    where: {
      customerId: customer.id,
      shopId,
      status: { notIn: ["delivered", "cancelled", "returned"] },
    },
    orderBy: { createdAt: "desc" },
    include: { shipments: { take: 1, orderBy: { createdAt: "desc" } } },
  })

  if (!order) {
    return `Hi ${customer.name?.split(" ")[0] ?? "there"}! I couldn't find any active orders. If you have a question about a past order, just share the order number.`
  }

  const shipment = order.shipments[0]
  const firstName = customer.name?.split(" ")[0] ?? "there"

  const statusMap: Record<string, string> = {
    placed:    `Hi ${firstName}! 📦 Your order *${order.shopifyOrderName}* has been placed and is being prepared for dispatch. You'll get a notification once it ships!`,
    confirmed: `Hi ${firstName}! ✅ Your order *${order.shopifyOrderName}* is confirmed and will be dispatched soon.`,
    packed:    `Hi ${firstName}! 📦 Your order *${order.shopifyOrderName}* is packed and ready to go out!`,
    dispatched: shipment
      ? `Hi ${firstName}! 🚚 Your order *${order.shopifyOrderName}* is on the way!\n\n*Carrier:* ${shipment.carrier.toUpperCase()}\n*AWB:* ${shipment.awb}\n*Status:* ${shipment.status.replace(/_/g, " ")}`
      : `Hi ${firstName}! 🚚 Your order *${order.shopifyOrderName}* has been dispatched!`,
    in_transit: shipment
      ? `Hi ${firstName}! 🚚 Your order *${order.shopifyOrderName}* is in transit.\n\n*Carrier:* ${shipment.carrier.toUpperCase()}\n*AWB:* ${shipment.awb}`
      : `Your order *${order.shopifyOrderName}* is in transit.`,
    out_for_delivery: `Hi ${firstName}! 🛵 Great news — your order *${order.shopifyOrderName}* is out for delivery today!`,
  }

  return statusMap[order.status]
    ?? `Hi ${firstName}! Your order *${order.shopifyOrderName}* is currently *${order.status.replace(/_/g, " ")}*.`
}

// ── Support ticket helper ─────────────────────────────────────────────────────

async function findOrCreateTicket(shopId: string, customer: { id: string; ltvTier: string }) {
  const existing = await db.supportTicket.findFirst({
    where: {
      customerId: customer.id,
      status: { in: ["open", "in_progress"] },
    },
    orderBy: { openedAt: "desc" },
  })
  if (existing) return existing

  return db.supportTicket.create({
    data: {
      shopId,
      customerId: customer.id,
      channel: "whatsapp",
      intent: "other",
      priority: customer.ltvTier === "vip" ? "high" : "normal",
      isVip: customer.ltvTier === "vip",
      conversation: [],
      status: "open",
    },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      field: string
      value?: {
        metadata?: { phone_number_id: string }
        messages?: Array<{
          from: string
          type: string
          text?: { body: string }
        }>
      }
    }>
  }>
}
