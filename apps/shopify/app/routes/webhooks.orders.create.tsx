import type { ActionFunctionArgs } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { handleOrderPlaced } from "@d2c/core"
import { db } from "@d2c/database"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request)

  if (topic !== "ORDERS_CREATE") return new Response("Unhandled topic", { status: 404 })

  const shopRecord = await db.shop.findUnique({ where: { domain: shop } })
  if (!shopRecord) return new Response("Shop not found", { status: 404 })

  // Fire-and-forget — don't block webhook response
  handleOrderPlaced(
    shopRecord.id,
    payload as Parameters<typeof handleOrderPlaced>[1],
    payload.customer?.id ? String(payload.customer.id) : undefined
  ).catch(console.error)

  return new Response("OK", { status: 200 })
}
