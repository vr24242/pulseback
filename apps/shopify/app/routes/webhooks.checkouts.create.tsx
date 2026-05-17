import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { queueWebhook } from "@d2c/core/queue"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request)

  const webhookId =
    request.headers.get("X-Shopify-Webhook-Id") ??
    request.headers.get("x-shopify-webhook-id") ??
    `checkout-create-${(payload as { token?: string })?.token ?? Date.now()}`

  await queueWebhook({
    topic: "checkouts/create",
    shopDomain: shop,
    shopifyWebhookId: webhookId,
    payload,
  })

  return json({ ok: true })
}
