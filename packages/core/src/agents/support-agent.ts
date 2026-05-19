import Anthropic from "@anthropic-ai/sdk"
import { db } from "@d2c/database"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SUPPORT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_order_status",
    description: "Get current status and tracking for a customer order",
    input_schema: {
      type: "object" as const,
      properties: {
        orderId: { type: "string" },
        shopifyOrderName: { type: "string" },
      },
    },
  },
  {
    name: "initiate_return",
    description: "Start a return or exchange for an order",
    input_schema: {
      type: "object" as const,
      properties: {
        orderId: { type: "string", description: "Internal order ID" },
        reason: { type: "string" },
        type: { type: "string", enum: ["return", "exchange"] },
      },
      required: ["orderId", "reason", "type"],
    },
  },
  {
    name: "cancel_order",
    description: "Cancel an order if it hasn't been dispatched yet",
    input_schema: {
      type: "object" as const,
      properties: {
        orderId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["orderId", "reason"],
    },
  },
  {
    name: "update_delivery_address",
    description: "Update the delivery address for an order that hasn't been dispatched yet",
    input_schema: {
      type: "object" as const,
      properties: {
        orderId: { type: "string" },
        newAddress: {
          type: "object",
          properties: {
            line1: { type: "string" },
            line2: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            pincode: { type: "string" },
          },
          required: ["line1", "city", "pincode"],
        },
      },
      required: ["orderId", "newAddress"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Escalate the ticket to a human agent with context",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: { type: "string" },
        priority: { type: "string", enum: ["normal", "high", "urgent"] },
      },
      required: ["reason", "priority"],
    },
  },
]

export async function handleSupportMessage(input: {
  shopId: string
  customerId: string
  ticketId: string
  incomingMessage: string
  conversationHistory: Array<{ role: string; content: string }>
  language?: string          // detected by franc — "hindi" | "english" | "tamil" etc.
  needsRegionalLang?: boolean // true → Sarvam AI when available (currently falls back to English)
}): Promise<{ reply: string; escalated: boolean; actionTaken?: string }> {
  const customer = await db.customer.findUnique({
    where: { id: input.customerId },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { shipments: { take: 1 } },
      },
      supportTickets: { orderBy: { openedAt: "desc" }, take: 3 },
    },
  })

  if (!customer) return { reply: "Sorry, I couldn't find your account.", escalated: false }

  const recentOrder = customer.orders[0]
  const recentShipment = recentOrder?.shipments[0]

  const languageInstruction = input.needsRegionalLang && input.language !== "english"
    ? `LANGUAGE: The customer is writing in ${input.language}. Respond in simple, friendly ${input.language} using common words. If you are not confident in ${input.language}, respond in English — do not guess.`
    : "LANGUAGE: Respond in English."

  const systemPrompt = `You are the AI support agent for this D2C brand.
You are helpful, empathetic, and efficient. Resolve issues without making the customer repeat themselves.

${languageInstruction}

CUSTOMER PROFILE:
- Name: ${customer.name ?? "Customer"}
- Total orders: ${customer.totalOrders}
- LTV: ₹${customer.ltv.toLocaleString("en-IN")}
- Lifecycle: ${customer.lifecycleStage}
- VIP: ${customer.ltvTier === "vip" ? "YES — treat with priority" : "No"}

RECENT ORDER:
${recentOrder ? `- Order ${recentOrder.shopifyOrderName}: ₹${recentOrder.totalPrice} — Status: ${recentOrder.status}` : "No recent orders"}
${recentShipment ? `- Shipment: ${recentShipment.carrier} AWB ${recentShipment.awb} — ${recentShipment.status}` : ""}

PAST TICKETS: ${customer.supportTickets.length} ticket(s) in history.

RULES:
- For WISMO → use get_order_status tool first
- For returns → use initiate_return tool
- For cancels → check if possible, then use cancel_order
- If you cannot resolve → use escalate_to_human
- Never ask the customer for their order number if you already have it
- Be concise. One question at a time if you need clarification.`

  const messages: Anthropic.MessageParam[] = [
    ...input.conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: input.incomingMessage },
  ]

  let response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    tools: SUPPORT_TOOLS,
    messages,
  })

  let actionTaken: string | undefined
  let escalated = false

  while (response.stop_reason === "tool_use") {
    const toolUses = response.content.filter((b) => b.type === "tool_use")
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUses) {
      if (toolUse.type !== "tool_use") continue
      const inp = toolUse.input as Record<string, unknown>
      const result = await executeSupportTool(input, toolUse.name, inp)
      if (toolUse.name === "escalate_to_human") escalated = true
      actionTaken = toolUse.name
      toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) })
    }

    messages.push({ role: "assistant", content: response.content })
    messages.push({ role: "user", content: toolResults })

    response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools: SUPPORT_TOOLS,
      messages,
    })
  }

  const textBlock = response.content.find((b) => b.type === "text")
  const reply = textBlock && textBlock.type === "text" ? textBlock.text : "Let me connect you with our team."

  // Append to ticket conversation
  await db.supportTicket.update({
    where: { id: input.ticketId },
    data: {
      conversation: {
        push: [
          { role: "customer", content: input.incomingMessage, timestamp: new Date() },
          { role: "claude", content: reply, timestamp: new Date(), actionTaken },
        ],
      },
      status: escalated ? "escalated" : "in_progress",
      escalatedAt: escalated ? new Date() : undefined,
    },
  })

  return { reply, escalated, actionTaken }
}

async function executeSupportTool(
  context: { shopId: string; customerId: string; ticketId: string },
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown> {
  if (toolName === "get_order_status") {
    const order = await db.order.findFirst({
      where: {
        shopId: context.shopId,
        customerId: context.customerId,
        ...(input.shopifyOrderName
          ? { shopifyOrderName: input.shopifyOrderName as string }
          : {}),
      },
      include: { shipments: { take: 1 } },
    })
    return order
      ? { status: order.status, paymentMethod: order.paymentMethod, shipment: order.shipments[0] }
      : { error: "Order not found" }
  }

  if (toolName === "initiate_return") {
    await db.order.update({
      where: { id: input.orderId as string },
      data: { status: "returned" },
    })
    return { success: true, message: "Return initiated. Pickup will be arranged within 24 hours." }
  }

  if (toolName === "cancel_order") {
    const order = await db.order.findUnique({ where: { id: input.orderId as string } })
    if (!order) return { success: false, error: "Order not found" }
    if (["dispatched", "delivered"].includes(order.status)) {
      return { success: false, error: "Order already dispatched — initiate return instead" }
    }
    await db.order.update({
      where: { id: input.orderId as string },
      data: { status: "cancelled", cancelledAt: new Date(), cancelReason: input.reason as string },
    })
    return { success: true }
  }

  if (toolName === "update_delivery_address") {
    const order = await db.order.findUnique({ where: { id: input.orderId as string } })
    if (!order) return { success: false, error: "Order not found" }
    if (["dispatched", "delivered", "returned", "cancelled"].includes(order.status)) {
      return {
        success: false,
        error: `Cannot update address — order is already ${order.status}. Please contact support for help.`,
      }
    }
    const newAddress = input.newAddress as {
      line1: string; line2?: string; city: string; state?: string; pincode: string
    }
    await db.order.update({
      where: { id: input.orderId as string },
      data: {
        shippingAddress: newAddress as Record<string, unknown>,
        pincode: newAddress.pincode,
      },
    })
    return { success: true, updatedAddress: newAddress }
  }

  if (toolName === "escalate_to_human") {
    await db.supportTicket.update({
      where: { id: context.ticketId },
      data: {
        status: "escalated",
        escalatedAt: new Date(),
        escalationReason: input.reason as string,
        priority: input.priority as string,
      },
    })
    return { success: true }
  }

  return { error: "Unknown tool" }
}
