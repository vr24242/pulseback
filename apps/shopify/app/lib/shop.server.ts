import { redirect } from "@remix-run/node"
import { db } from "@d2c/database"

/**
 * Resolves the shop from ?shop= param.
 * If missing or not found, redirects to the same path with the first active shop's domain.
 * This prevents child route loaders from throwing 404s on nav clicks.
 */
export async function requireShop(request: Request) {
  const url = new URL(request.url)
  const shopDomain = url.searchParams.get("shop") ?? ""

  if (shopDomain) {
    const shop = await db.shop.findUnique({ where: { domain: shopDomain } })
    if (shop) return shop
  }

  // No shop param or not found — redirect with the first active shop
  const fallback = await db.shop.findFirst({ where: { isActive: true }, select: { domain: true } })
  if (fallback) {
    const dest = url.pathname + `?shop=${fallback.domain}`
    throw redirect(dest)
  }

  throw redirect("/")
}
