/**
 * inventory.server.ts — Inventory analytics service
 *
 * Aggregates per-product metrics from Order.items JSON + live Shopify inventory.
 * Prisma can't GROUP BY JSON, so we load orders and aggregate in-memory.
 * Only top-N product IDs are sent to Shopify API to keep it fast.
 */

import { db } from "@d2c/database"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyLineItem {
  product_id?: number | string
  variant_id?: number | string
  title: string
  quantity: number
  price: string
  sku?: string
}

export interface ProductStat {
  productId: string
  variantId: string
  title: string
  sku: string
  unitsSold: number
  revenue: number
  orderCount: number
  rtoCount: number
  returnCount: number
  // Computed
  rtoRate: number            // 0–1
  revenueShare: number       // 0–1 of total revenue
  velocityPerDay: number     // units/day
  // From Shopify API (null if unavailable)
  inventoryQty: number | null
  daysOfStock: number | null // null = no inventory data
  stockTier: "critical" | "warning" | "healthy" | "unknown"
}

export interface InventoryStats {
  totalProducts: number
  criticalCount: number     // <7 days of stock
  warningCount: number      // 7-14 days
  deadStockCount: number    // >30 days stock AND <0.5 units/day
  totalRevenue: number
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function getInventoryAnalytics(
  shopId: string,
  shopDomain: string,
  accessToken: string,
  rangeDays = 30,
): Promise<{ products: ProductStat[]; stats: InventoryStats }> {
  const since = new Date(Date.now() - rangeDays * 86_400_000)

  // Load orders + return requests in parallel
  const [orders, returnRequests] = await Promise.all([
    db.order.findMany({
      where: { shopId, createdAt: { gte: since }, status: { not: "cancelled" } },
      select: { items: true, isRTO: true },
    }),
    db.returnRequest.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: { items: true },
    }),
  ])

  // ── Aggregate orders ──────────────────────────────────────────────────────────
  const productMap = new Map<string, {
    productId: string; variantId: string; title: string; sku: string
    unitsSold: number; revenue: number; orderCount: number; rtoCount: number
  }>()

  for (const order of orders) {
    const lineItems = (order.items as unknown as ShopifyLineItem[]) ?? []
    for (const item of lineItems) {
      const key = String(item.product_id ?? item.title)
      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: String(item.product_id ?? ""),
          variantId: String(item.variant_id ?? ""),
          title: item.title,
          sku: item.sku ?? "",
          unitsSold: 0, revenue: 0, orderCount: 0, rtoCount: 0,
        })
      }
      const p = productMap.get(key)!
      p.unitsSold += item.quantity
      p.revenue += parseFloat(item.price || "0") * item.quantity
      p.orderCount++
      if (order.isRTO) p.rtoCount++
    }
  }

  // ── Count returns per product ─────────────────────────────────────────────────
  const returnCountMap = new Map<string, number>()
  for (const ret of returnRequests) {
    const items = (ret.items as unknown as Array<{ title?: string }>) ?? []
    for (const item of items) {
      const key = item.title ?? ""
      returnCountMap.set(key, (returnCountMap.get(key) ?? 0) + 1)
    }
  }

  // ── Fetch Shopify inventory for top products ───────────────────────────────────
  const topProductIds = Array.from(productMap.values())
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 50)                                     // top 50 by volume
    .map(p => p.productId)
    .filter(id => id && id !== "undefined")

  const inventoryMap = await fetchShopifyInventory(shopDomain, accessToken, topProductIds)

  // ── Build final product list ──────────────────────────────────────────────────
  const totalRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0)

  const products: ProductStat[] = Array.from(productMap.values()).map(p => {
    const velocityPerDay = p.unitsSold / rangeDays
    const inventoryQty = inventoryMap.get(p.productId) ?? null
    const daysOfStock = inventoryQty !== null && velocityPerDay > 0
      ? Math.floor(inventoryQty / velocityPerDay)
      : null
    const stockTier: ProductStat["stockTier"] =
      daysOfStock === null       ? "unknown"
      : daysOfStock < 7          ? "critical"
      : daysOfStock < 14         ? "warning"
      : "healthy"
    const returnCount = returnCountMap.get(p.title) ?? 0

    return {
      ...p,
      returnCount,
      rtoRate: p.orderCount > 0 ? p.rtoCount / p.orderCount : 0,
      revenueShare: totalRevenue > 0 ? p.revenue / totalRevenue : 0,
      velocityPerDay: Math.round(velocityPerDay * 10) / 10,
      inventoryQty,
      daysOfStock,
      stockTier,
    }
  })

  // Sort: critical first, then warning, then by units sold
  const tierOrder = { critical: 0, warning: 1, unknown: 2, healthy: 3 }
  products.sort((a, b) => {
    const t = tierOrder[a.stockTier] - tierOrder[b.stockTier]
    return t !== 0 ? t : b.unitsSold - a.unitsSold
  })

  const stats: InventoryStats = {
    totalProducts: products.length,
    criticalCount: products.filter(p => p.stockTier === "critical").length,
    warningCount: products.filter(p => p.stockTier === "warning").length,
    deadStockCount: products.filter(p =>
      p.daysOfStock !== null && p.daysOfStock > 30 && p.velocityPerDay < 0.5
    ).length,
    totalRevenue,
  }

  return { products, stats }
}

// ─── Shopify Admin API — inventory fetch ──────────────────────────────────────

async function fetchShopifyInventory(
  domain: string,
  token: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!productIds.length || !token) return map

  try {
    // Fetch products with their variant inventory quantities
    const ids = productIds.slice(0, 50).join(",")
    const res = await fetch(
      `https://${domain}/admin/api/2024-01/products.json?ids=${ids}&fields=id,variants&limit=50`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      },
    )
    if (!res.ok) return map

    const data = await res.json() as {
      products: Array<{
        id: number
        variants: Array<{ id: number; inventory_quantity: number }>
      }>
    }

    for (const product of data.products ?? []) {
      // Sum across all variants
      const totalQty = product.variants.reduce((s, v) => s + (v.inventory_quantity ?? 0), 0)
      map.set(String(product.id), Math.max(0, totalQty))
    }
  } catch {
    // Non-fatal — inventory data is enrichment, not core
  }

  return map
}
