import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { queueWebhook } from "@d2c/core/queue"

/**
 * orders/updated webhook — thin enqueuer.
 *
 * Handles: cancellations, fulfillment/dispatch events.
 * Processing is fully async in webhook.worker.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request)

  const webhookId =
    request.headers.get("X-Shopify-Webhook-Id") ??
    request.headers.get("x-shopify-webhook-id") ??
    `orders-updated-${(payload as { id?: number })?.id ?? Date.now()}`

  await queueWebhook({
    topic: "orders/updated",
    shopDomain: shop,
    shopifyWebhookId: webhookId,
    payload,
  })

  return json({ ok: true })
}
