import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useActionData, useLoaderData, useSubmit, useNavigation } from "@remix-run/react"
import { useState } from "react"
import { Page, Card, BlockStack, TextField, Button, Text, InlineStack } from "@shopify/polaris"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"
import { runMerchantChat } from "@d2c/core"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = await db.shop.findUnique({ where: { domain: session.shop } })
  return json({ shopId: shop?.id ?? "" })
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = await db.shop.findUnique({ where: { domain: session.shop } })
  if (!shop) return json({ error: "Shop not found" })

  const body = await request.json() as { message: string; history: Array<{ role: string; content: string }> }

  const reply = await runMerchantChat(shop.id, body.message, body.history as Array<{ role: "user" | "assistant"; content: string }>)
  return json({ reply })
}

export default function ChatPage() {
  const { shopId } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const submit = useSubmit()
  const navigation = useNavigation()

  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const isLoading = navigation.state === "submitting"

  const handleSend = () => {
    if (!message.trim()) return
    const newHistory = [...history, { role: "user" as const, content: message }]
    setHistory(newHistory)
    setMessage("")
    submit(JSON.stringify({ message, history }), {
      method: "POST",
      encType: "application/json",
    })
  }

  const allMessages = actionData && "reply" in actionData
    ? [...history, { role: "assistant" as const, content: actionData.reply }]
    : history

  return (
    <Page title="Ask your AI">
      <Card>
        <BlockStack gap="400">
          <div style={{ minHeight: "400px" }}>
          <BlockStack gap="300">
            {allMessages.length === 0 && (
              <Text as="p" tone="subdued">
                Ask anything about your store — "Who are my at-risk customers?", "What's my RTO rate this month?", "Show me top customers by LTV"
              </Text>
            )}
            {allMessages.map((m, i) => (
              <BlockStack key={i} gap="100">
                <Text as="p" tone={m.role === "user" ? undefined : "subdued"} variant="bodySm" fontWeight={m.role === "user" ? "bold" : undefined}>
                  {m.role === "user" ? "You" : "AI"}
                </Text>
                <Text as="p">{m.content}</Text>
              </BlockStack>
            ))}
            {isLoading && <Text as="p" tone="subdued">Thinking...</Text>}
          </BlockStack>
          </div>

          <InlineStack gap="300" align="end">
            <div style={{ flex: 1 }}>
              <TextField
                label=""
                labelHidden
                value={message}
                onChange={setMessage}
                placeholder="Ask about your store..."
                autoComplete="off"
                onKeyPress={(e: React.KeyboardEvent) => e.key === "Enter" && handleSend()}
              />
            </div>
            <Button onClick={handleSend} loading={isLoading} variant="primary">
              Send
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </Page>
  )
}
