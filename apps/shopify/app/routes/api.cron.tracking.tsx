import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { pollActiveShipments } from "@d2c/core"
import { db } from "@d2c/database"

// Called every 2 hours by external cron
// POST /api/cron/tracking
// Header: X-Cron-Secret: <CRON_SECRET>

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = request.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const shops = await db.shop.findMany({
    where: { isActive: true },
    select: { id: true, domain: true },
  })

  const results: Record<string, string> = {}

  await Promise.allSettled(
    shops.map(async (shop) => {
      try {
        await pollActiveShipments(shop.id)
        results[shop.domain] = "ok"
      } catch (err) {
        results[shop.domain] = String(err)
      }
    })
  )

  return json({ processed: shops.length, results })
}

export const loader = async () => json({ ok: true, endpoint: "shipment-tracking-cron" })
