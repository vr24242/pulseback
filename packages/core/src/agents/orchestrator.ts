import Anthropic from "@anthropic-ai/sdk"
import { db } from "@d2c/database"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Tools available to the merchant analytics agent
const MERCHANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_revenue_summary",
    description: "Get revenue summary for a given period",
    input_schema: {
      type: "object" as const,
      properties: {
        period: { type: "string", enum: ["today", "7d", "30d", "90d"] },
      },
      required: ["period"],
    },
  },
  {
    name: "get_customer_segment",
    description: "Get customers matching specific criteria",
    input_schema: {
      type: "object" as const,
      properties: {
        lifecycleStage: { type: "string" },
        ltvTier: { type: "string" },
        churnScoreMin: { type: "number" },
        daysSinceLastOrderMin: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_order_stats",
    description: "Get order statistics including RTO rate, cancel rate, return rate",
    input_schema: {
      type: "object" as const,
      properties: {
        period: { type: "string", enum: ["today", "7d", "30d"] },
      },
      required: ["period"],
    },
  },
  {
    name: "get_shipping_performance",
    description: "Get shipping stats by carrier — delay rates, RTO rates, delivery times",
    input_schema: {
      type: "object" as const,
      properties: {
        period: { type: "string", enum: ["7d", "30d"] },
      },
      required: ["period"],
    },
  },
]

export async function runMerchantChat(
  shopId: string,
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true, currency: true },
  })

  const systemPrompt = `You are the AI brain of ${shop?.name}'s D2C operating system.
You have full access to their store data. Be direct, specific, and actionable.
Currency: ${shop?.currency ?? "INR"}. Today: ${new Date().toDateString()}.
When merchants ask about customers or data, use your tools to fetch real numbers.
Never make up data — always use tools.`

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ]

  let response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    tools: MERCHANT_TOOLS,
    messages,
  })

  // Agentic loop — keep running until no more tool calls
  while (response.stop_reason === "tool_use") {
    const toolUses = response.content.filter((b) => b.type === "tool_use")
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUses) {
      if (toolUse.type !== "tool_use") continue
      const result = await executeTool(shopId, toolUse.name, toolUse.input as Record<string, unknown>)
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      })
    }

    messages.push({ role: "assistant", content: response.content })
    messages.push({ role: "user", content: toolResults })

    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      tools: MERCHANT_TOOLS,
      messages,
    })
  }

  const textBlock = response.content.find((b) => b.type === "text")
  return textBlock && textBlock.type === "text" ? textBlock.text : ""
}

async function executeTool(
  shopId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const periodDays: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 }
  const days = periodDays[(input.period as string) ?? "30d"] ?? 30
  const since = new Date(Date.now() - days * 86400000)

  if (toolName === "get_revenue_summary") {
    const orders = await db.order.findMany({
      where: { shopId, createdAt: { gte: since }, status: { notIn: ["cancelled"] } },
      select: { totalPrice: true, paymentMethod: true },
    })
    const total = orders.reduce((s, o) => s + o.totalPrice, 0)
    const cod = orders.filter((o) => o.paymentMethod === "cod").length
    return {
      totalRevenue: total,
      orderCount: orders.length,
      codOrders: cod,
      prepaidOrders: orders.length - cod,
      aov: orders.length ? total / orders.length : 0,
    }
  }

  if (toolName === "get_customer_segment") {
    const customers = await db.customer.findMany({
      where: {
        shopId,
        ...(input.lifecycleStage ? { lifecycleStage: input.lifecycleStage as string } : {}),
        ...(input.ltvTier ? { ltvTier: input.ltvTier as string } : {}),
        ...(input.churnScoreMin ? { churnScore: { gte: input.churnScoreMin as number } } : {}),
      },
      take: (input.limit as number) ?? 20,
      select: { id: true, name: true, phone: true, ltv: true, churnScore: true, lastOrderAt: true },
    })
    return customers
  }

  if (toolName === "get_order_stats") {
    const orders = await db.order.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: { status: true, isRTO: true, paymentMethod: true, totalPrice: true },
    })
    const total = orders.length
    return {
      total,
      delivered: orders.filter((o) => o.status === "delivered").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      rto: orders.filter((o) => o.isRTO).length,
      rtoRate: total ? orders.filter((o) => o.isRTO).length / total : 0,
    }
  }

  if (toolName === "get_shipping_performance") {
    const shipments = await db.shipment.findMany({
      where: { order: { shopId }, createdAt: { gte: since } },
      select: { carrier: true, status: true, isStuck: true },
    })
    const byCarrier: Record<string, { total: number; delivered: number; rto: number; stuck: number }> = {}
    for (const s of shipments) {
      if (!byCarrier[s.carrier]) byCarrier[s.carrier] = { total: 0, delivered: 0, rto: 0, stuck: 0 }
      byCarrier[s.carrier].total++
      if (s.status === "delivered") byCarrier[s.carrier].delivered++
      if (s.status === "rto_delivered") byCarrier[s.carrier].rto++
      if (s.isStuck) byCarrier[s.carrier].stuck++
    }
    return byCarrier
  }

  return { error: "Unknown tool" }
}
