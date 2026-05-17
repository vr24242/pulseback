import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import crypto from "crypto"
import { db } from "@d2c/database"
import { getTrackingQueue } from "@d2c/core/queue"

// Shiprocket sends webhook events to this URL
// Configure in Shiprocket dashboard → Settings → Webhooks
// URL: https://pulseback.fly.dev/webhooks/shiprocket

export const action = async ({ request }: ActionFunctionArgs) => {
  // Thin enqueue — all logic in tracking.worker
  try {
    const body = await request.json() as Record<string, unknown> & { shop_domain?: string }

    // Verify HMAC signature if shop_domain is provided
    if (body.shop_domain) {
      const shop = await db.shop.findUnique({
        where: { domain: body.shop_domain },
        select: { shiprocketWebhookSecret: true },
      })

      if (shop?.shiprocketWebhookSecret) {
        const signature = request.headers.get("x-shiprocket-signature")
        if (signature) {
          const bodyString = JSON.stringify(body)
          const computed = crypto
            .createHmac("sha256", shop.shiprocketWebhookSecret)
            .update(bodyString)
            .digest("hex")

          if (signature !== computed) {
            console.warn(
              `[webhooks/shiprocket] Invalid signature for ${body.shop_domain}`
            )
            return json({ ok: true }) // never expose signature validation failure
          }
        } else {
          console.warn(`[webhooks/shiprocket] Missing signature header for ${body.shop_domain}`)
        }
      }
    }

    const queue = getTrackingQueue()
    // Extract AWB from Shiprocket payload if present, then let tracking worker sweep
    const awb = body.awb as string | undefined
    await queue.add("track", { awb, source: "shiprocket-webhook" }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    })
    return json({ ok: true })
  } catch {
    return json({ ok: true }) // never reject Shiprocket webhooks
  }
}

export const loader = () => json({ ok: true }) // GET health check
