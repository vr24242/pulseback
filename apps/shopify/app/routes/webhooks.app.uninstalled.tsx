import type { ActionFunctionArgs } from "@remix-run/node"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request)

  await db.shop.updateMany({
    where: { domain: shop },
    data: { isActive: false },
  })

  return new Response("OK", { status: 200 })
}
