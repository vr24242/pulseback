import Anthropic from "@anthropic-ai/sdk"
import type { CustomerMemory } from "../customer-memory"

const client = new Anthropic()

export interface CartDecision {
  action: "send" | "wait_2h" | "wait_until_morning" | "skip" | "escalate_human"
  touchNumber: 1 | 2 | 3
  offerDiscount: boolean
  discountPercent: number  // 0 if no discount
  channel: "whatsapp"
  reasoning: string
}

export async function decideAbandonedCart(
  memory: CustomerMemory,
  cart: {
    value: number
    itemSummary: string
    recoveryAttempts: number  // how many touches already sent
    abandonedAt: Date
  },
): Promise<CartDecision> {
  // ── Fast rule-based decisions (no LLM needed) ────────────────────────────

  // Never spam: ignored 3+ comms in a row
  if (memory.hasIgnoredLast3Comms) {
    return {
      action: "skip",
      touchNumber: 1,
      offerDiscount: false,
      discountPercent: 0,
      channel: "whatsapp",
      reasoning: "Customer has ignored last 3 communications. Preserving trust by staying silent.",
    }
  }

  // Coordination: unresolved issues take priority
  if (memory.hasOpenNDR || memory.hasPendingRefund || memory.hasPendingReturn) {
    return {
      action: "skip",
      touchNumber: 1,
      offerDiscount: false,
      discountPercent: 0,
      channel: "whatsapp",
      reasoning: `Cannot send cart recovery while customer has unresolved issue: ${
        memory.hasOpenNDR ? "open NDR" :
        memory.hasPendingRefund ? "pending refund" : "pending return"
      }`,
    }
  }

  // Quiet hours: 22:00–08:00 IST
  const istHour = (new Date().getUTCHours() + 5) % 24
  if (istHour >= 22 || istHour < 8) {
    return {
      action: "wait_until_morning",
      touchNumber: (cart.recoveryAttempts + 1) as 1 | 2 | 3,
      offerDiscount: false,
      discountPercent: 0,
      channel: "whatsapp",
      reasoning: "Quiet hours (10pm–8am IST). Will send at 8am.",
    }
  }

  // Max attempts reached
  if (cart.recoveryAttempts >= 3) {
    return {
      action: "skip",
      touchNumber: 3,
      offerDiscount: false,
      discountPercent: 0,
      channel: "whatsapp",
      reasoning: "Maximum recovery attempts (3) reached.",
    }
  }

  // VIP: escalate to human for personal touch
  if (memory.ltvTier === "vip" && cart.value > 2000) {
    return {
      action: "escalate_human",
      touchNumber: 1,
      offerDiscount: false,
      discountPercent: 0,
      channel: "whatsapp",
      reasoning: `VIP customer (${memory.ltvTier}) with cart value ₹${cart.value}. Escalating to human for personal outreach.`,
    }
  }

  // ── LLM decision for nuanced cases ───────────────────────────────────────
  // Use Haiku for standard customers, Sonnet for high-value / complex history
  const useHighQuality = memory.totalOrders > 5 || cart.value > 3000

  const prompt = `You are a cart recovery decision agent for a D2C brand in India.
A customer abandoned their cart. Decide the optimal recovery action.

Customer Context:
- Total orders: ${memory.totalOrders}
- Avg order value: ₹${memory.avgOrderValue.toFixed(0)}
- LTV tier: ${memory.ltvTier}
- Lifecycle: ${memory.lifecycleStage}
- RTO risk score: ${memory.rtoRiskScore}/100 (>60 = high risk)
- Return rate: ${(memory.returnRate * 100).toFixed(0)}%
- Last 3 comms responded: ${memory.recentComms.slice(0, 3).some((c) => c.replied) ? "yes" : "no"}
- Ignored last 3 comms: ${memory.hasIgnoredLast3Comms}
- Preferred reply hour (IST): ${memory.preferredReplyHour ?? "unknown"}

Cart Context:
- Cart value: ₹${cart.value}
- Items: ${cart.itemSummary}
- Recovery attempts so far: ${cart.recoveryAttempts}
- Abandoned: ${Math.round((Date.now() - cart.abandonedAt.getTime()) / 60000)} minutes ago

Decide:
1. action: "send" (send now) | "wait_2h" (retry in 2h) | "skip" (don't send)
2. touchNumber: which touch this is (${cart.recoveryAttempts + 1})
3. offerDiscount: true/false (only if cart value > ₹500 and customer is not VIP)
4. discountPercent: 0-15 (0 if no discount)
5. reasoning: one sentence explaining the decision

Respond as JSON only:
{"action":"send","touchNumber":${cart.recoveryAttempts + 1},"offerDiscount":false,"discountPercent":0,"reasoning":"..."}`

  try {
    const response = await client.messages.create({
      model: useHighQuality ? "claude-sonnet-4-5" : "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : "{}"
    const parsed = JSON.parse(text.trim()) as Partial<CartDecision>

    return {
      action: parsed.action ?? "send",
      touchNumber: (parsed.touchNumber ?? cart.recoveryAttempts + 1) as 1 | 2 | 3,
      offerDiscount: parsed.offerDiscount ?? false,
      discountPercent: parsed.discountPercent ?? 0,
      channel: "whatsapp",
      reasoning: parsed.reasoning ?? "LLM decision",
    }
  } catch {
    // Fallback: safe default
    return {
      action: "send",
      touchNumber: (cart.recoveryAttempts + 1) as 1 | 2 | 3,
      offerDiscount: cart.value >= 500 && cart.recoveryAttempts === 2,
      discountPercent: cart.value >= 500 && cart.recoveryAttempts === 2 ? 10 : 0,
      channel: "whatsapp",
      reasoning: "Fallback decision (LLM unavailable).",
    }
  }
}
