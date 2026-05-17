import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { queueWebhook } from "@d2c/core/queue"

/**
 * orders/create webhook — thin enqueuer.
 *
 * All processing (customer upsert, order record, WhatsApp notification)
 * happens in webhook.worker with full retry + dedup via Shopify-Webhook-Id.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request)

  // Shopify sends this header on every webhook delivery — use it as dedup key.
  // If Shopify retries the same event, BullMQ rejects the duplicate (same jobId).
  const webhookId =
    request.headers.get("X-Shopify-Webhook-Id") ??
    request.headers.get("x-shopify-webhook-id") ??
    `orders-create-${(payload as { id?: number })?.id ?? Date.now()}`

  await queueWebhook({
    topic: "orders/create",
    shopDomain: shop,
    shopifyWebhookId: webhookId,
    payload,
  })

  // Always return 200 immediately — Shopify will retry if we return anything else.
  return json({ ok: true })
}
