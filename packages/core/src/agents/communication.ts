import Anthropic from "@anthropic-ai/sdk"
import { randomUUID } from "crypto"
import type { CustomerMemory } from "./customer-memory"

const client = new Anthropic()

export interface CommInput {
  intent: string
  customerMemory: CustomerMemory
  brandVoice: {
    name: string
    tone: "formal" | "casual" | "friendly"
  }
  context: {
    cartValue?: number
    itemSummary?: string
    recoveryLink?: string
    trackingUrl?: string
    discountCode?: string
    discountPercent?: number
    customData?: Record<string, string>
  }
  constraints?: {
    maxLength?: number
    noDiscount?: boolean
  }
}

export interface CommOutput {
  message: string
  language: string
  tone: string
  outcomeRef: string
}

const INTENT_PROMPTS: Record<string, string> = {
  cart_recovery_touch1: "Gentle reminder that they left items in their cart. Curious, not pushy. Don't mention discount.",
  cart_recovery_touch2: "Second attempt. Acknowledge they might be busy. Add urgency about cart expiry. Still no discount unless specified.",
  cart_recovery_touch3: "Final attempt. If discount provided, lead with it. Keep it short.",
  ndr_confirm_availability: "Check if customer will be available for delivery. Friendly, helpful tone.",
  ndr_address_correction: "Politely ask if there's an issue with the delivery address. Give them an easy way to update.",
  ndr_final_notice: "Final notice before potential return. Urgent but not threatening.",
  cod_confirmation: "Confirm the COD order. Ask them to reply YES to confirm. Keep it simple.",
  order_confirmed: "Celebrate their order. Give them tracking info once available.",
  winback_discount: "Win them back after a long gap. Lead with the offer. Warm, nostalgic if they're a loyal customer.",
  winback_curiosity: "Win them back without a discount. Mention something new or interesting about the brand.",
  at_risk_warning: "Gentle check-in. Not pushy. Just showing you care about them.",
}

export async function generateMessage(input: CommInput): Promise<CommOutput> {
  const { customerMemory: m, intent, brandVoice, context, constraints } = input
  const outcomeRef = randomUUID()

  const intentGuide = INTENT_PROMPTS[intent] ?? intent
  const lang = m.preferredLanguage === "hi" ? "Hindi" : "English"

  // Pick tone signals from customer memory
  const toneSignals: string[] = []
  if (m.sentiment === "negative") toneSignals.push("empathetic, no pressure")
  if (m.lifecycleStage === "champion") toneSignals.push("appreciative of loyalty")
  if (m.lifecycleStage === "lapsed") toneSignals.push("curiosity not desperation")
  if (m.totalReturns > 2) toneSignals.push("acknowledge past issues subtly")
  if (m.rtoCount > 0) toneSignals.push("gently nudge toward prepaid if applicable")
  if (m.ltvTier === "vip") toneSignals.push("personal and exclusive feel")

  const useHighQuality =
    m.ltvTier === "vip" ||
    m.totalOrders > 5 ||
    m.sentiment === "negative" ||
    intent.includes("winback")

  const prompt = `You write WhatsApp messages for ${brandVoice.name}, a D2C brand in India.
Tone: ${brandVoice.tone}. Language: ${lang}.
${toneSignals.length ? `Customer signals: ${toneSignals.join(", ")}.` : ""}

Intent: ${intentGuide}

Customer:
- Name: ${m.name ?? "valued customer"}
- Orders: ${m.totalOrders}
- LTV tier: ${m.ltvTier}
${context.cartValue ? `- Cart value: ₹${context.cartValue}` : ""}
${context.itemSummary ? `- Items: ${context.itemSummary}` : ""}
${context.discountCode ? `- Discount: ${context.discountPercent}% off, code: ${context.discountCode}` : ""}
${context.recoveryLink ? `- Link: ${context.recoveryLink}` : ""}
${context.trackingUrl ? `- Tracking: ${context.trackingUrl}` : ""}

Rules:
- WhatsApp message, max ${constraints?.maxLength ?? 300} characters
- No hashtags, no emojis unless naturally appropriate (max 1-2)
- Sound human, not like a bot
- ${constraints?.noDiscount ? "Do NOT mention any discount." : ""}
- Do not use "Dear Customer" or formal salutations
- End with a clear call to action if there's a link

Write ONLY the message text, nothing else.`

  try {
    const response = await client.messages.create({
      model: useHighQuality ? "claude-sonnet-4-5" : "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    })

    const message =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : ""

    return {
      message,
      language: lang === "Hindi" ? "hi" : "en",
      tone: toneSignals[0] ?? brandVoice.tone,
      outcomeRef,
    }
  } catch {
    // Fallback to simple template
    const fallback = context.recoveryLink
      ? `Hi${m.name ? ` ${m.name}` : ""}! You left something in your cart. Complete your order: ${context.recoveryLink}`
      : `Hi${m.name ? ` ${m.name}` : ""}! ${intentGuide}`
    return { message: fallback, language: "en", tone: "friendly", outcomeRef }
  }
}
