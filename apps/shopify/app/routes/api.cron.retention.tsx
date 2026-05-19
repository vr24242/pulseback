import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { runRetentionSweep } from "@d2c/core"
import { db } from "@d2c/database"

// Run daily — schedules win-back messages for at-risk customers
// POST /api/cron/retention
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
    shops.map(async (shop: typeof shops[number]) => {
      try {
        await runRetentionSweep(shop.id)
        results[shop.domain] = "ok"
      } catch (err) {
        results[shop.domain] = String(err)
      }
    })
  )

  return json({ processed: shops.length, results })
}

export const loader = async () => json({ ok: true, endpoint: "retention-cron" })
