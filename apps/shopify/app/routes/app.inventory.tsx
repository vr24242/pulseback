import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import { db } from "@d2c/database"
import { requireShop } from "~/lib/shop.server"
import { getInventoryAnalytics, type ProductStat, type InventoryStats } from "~/services/inventory.server"

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await requireShop(request)
  const url = new URL(request.url)
  const range = parseInt(url.searchParams.get("range") ?? "30", 10)
  const shopDomain = shop.domain

  const shopFull = await db.shop.findUnique({
    where: { id: shop.id },
    select: { accessToken: true },
  })

  const { products, stats } = await getInventoryAnalytics(
    shop.id,
    shop.domain,
    shopFull?.accessToken ?? "",
    range,
  )

  return json({ products, stats, range, shopDomain })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

function pct(n: number) {
  return (n * 100).toFixed(1) + "%"
}

const TIER_STYLE: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  critical: { bg: "rgba(239,68,68,0.12)", color: "#ef4444", label: "Critical", dot: "#ef4444" },
  warning:  { bg: "rgba(234,179,8,0.12)",  color: "#ca8a04", label: "Warning",  dot: "#eab308" },
  healthy:  { bg: "rgba(16,185,129,0.12)", color: "#10b981", label: "Healthy",  dot: "#10b981" },
  unknown:  { bg: "rgba(107,114,128,0.12)",color: "#6b7280", label: "No data",  dot: "#6b7280" },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InventoryDashboard() {
  const { products, stats, range, shopDomain } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  const allProducts = products as ProductStat[]
  const allStats = stats as InventoryStats

  function setRange(r: number) {
    navigate(`/app/inventory?shop=${shopDomain}&range=${r}`)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0d2137 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "32px 36px 28px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -60, right: -40, width: 200, height: 200, background: "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: "0 4px 12px rgba(16,185,129,0.4)" }}>📦</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>Inventory Intelligence</h1>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Stockout risk · Sales velocity · RTO by SKU</p>
              </div>
            </div>
          </div>
          {/* Range tabs */}
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 4 }}>
            {[7, 30, 90].map(r => (
              <button key={r} onClick={() => setRange(r)} style={{
                background: range === r ? "rgba(16,185,129,0.2)" : "transparent",
                color: range === r ? "#10b981" : "#64748b",
                border: range === r ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent",
                borderRadius: 7, padding: "6px 14px", fontSize: 13, fontWeight: range === r ? 600 : 400, cursor: "pointer",
              }}>{r}d</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 36px", maxWidth: 1280 }}>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          <StatCard icon="🚨" label="Critical (<7d stock)" value={allStats.criticalCount} accent="#ef4444" gradient="linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.04))" sub="Reorder now" />
          <StatCard icon="⚠️" label="Warning (<14d stock)" value={allStats.warningCount} accent="#eab308" gradient="linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.04))" sub="Monitor closely" />
          <StatCard icon="💀" label="Dead Stock" value={allStats.deadStockCount} accent="#6b7280" gradient="linear-gradient(135deg, rgba(107,114,128,0.15), rgba(107,114,128,0.04))" sub=">30d stock, <0.5/day" />
          <StatCard icon="📊" label="Products tracked" value={allStats.totalProducts} accent="#6c63ff" gradient="linear-gradient(135deg, rgba(108,99,255,0.15), rgba(108,99,255,0.04))" sub={`Last ${range} days`} />
        </div>

        {/* Products table */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>Products by Stock Urgency</span>
              <span style={{ fontSize: 12, color: "#475569", marginLeft: 10 }}>sorted by days of stock remaining</span>
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {allStats.totalProducts} products · {range}d window
            </div>
          </div>

          {allProducts.length === 0 ? (
            <div style={{ padding: 64, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>No order data yet</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>Product analytics appear once orders start coming in.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Product", "SKU", "Sold", "Revenue", "Velocity", "RTO %", "Return %", "Stock", "Days left"].map(h => (
                      <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#475569", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allProducts.slice(0, 50).map((p, i) => {
                    const tier = TIER_STYLE[p.stockTier]
                    const isDeadStock = p.daysOfStock !== null && p.daysOfStock > 30 && p.velocityPerDay < 0.5
                    const rtoHigh = p.rtoRate > 0.15

                    return (
                      <tr key={`${p.productId}-${i}`}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)", transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.06)")}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)")}
                      >
                        {/* Product */}
                        <td style={{ padding: "13px 18px", maxWidth: 220 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.title}
                          </div>
                          {isDeadStock && (
                            <span style={{ fontSize: 10, color: "#6b7280", background: "rgba(107,114,128,0.15)", padding: "1px 6px", borderRadius: 6, marginTop: 3, display: "inline-block" }}>dead stock</span>
                          )}
                        </td>
                        {/* SKU */}
                        <td style={{ padding: "13px 18px" }}>
                          <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{p.sku || "—"}</span>
                        </td>
                        {/* Sold */}
                        <td style={{ padding: "13px 18px", textAlign: "right" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{p.unitsSold}</span>
                          <div style={{ fontSize: 10, color: "#475569" }}>units</div>
                        </td>
                        {/* Revenue */}
                        <td style={{ padding: "13px 18px", textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>{formatINR(p.revenue)}</div>
                          <div style={{ fontSize: 10, color: "#475569" }}>{pct(p.revenueShare)} share</div>
                        </td>
                        {/* Velocity */}
                        <td style={{ padding: "13px 18px", textAlign: "center" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                            {p.velocityPerDay >= 1 ? `${p.velocityPerDay}/d` : `${(p.velocityPerDay * 7).toFixed(1)}/wk`}
                          </div>
                        </td>
                        {/* RTO rate */}
                        <td style={{ padding: "13px 18px", textAlign: "center" }}>
                          <span style={{
                            fontSize: 12, fontWeight: 600,
                            color: rtoHigh ? "#ef4444" : "#64748b",
                            background: rtoHigh ? "rgba(239,68,68,0.12)" : "transparent",
                            padding: rtoHigh ? "2px 8px" : "0", borderRadius: 8,
                          }}>
                            {p.rtoRate > 0 ? pct(p.rtoRate) : "—"}
                            {rtoHigh && " 🚨"}
                          </span>
                        </td>
                        {/* Return rate */}
                        <td style={{ padding: "13px 18px", textAlign: "center" }}>
                          <span style={{ fontSize: 12, color: p.returnCount > 0 ? "#f97316" : "#475569" }}>
                            {p.returnCount > 0 ? `${p.returnCount}x` : "—"}
                          </span>
                        </td>
                        {/* Inventory qty */}
                        <td style={{ padding: "13px 18px", textAlign: "center" }}>
                          {p.inventoryQty !== null ? (
                            <span style={{ fontSize: 13, fontWeight: 600, color: p.inventoryQty < 10 ? "#ef4444" : "#cbd5e1" }}>
                              {p.inventoryQty}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "#334155" }}>N/A</span>
                          )}
                        </td>
                        {/* Days of stock */}
                        <td style={{ padding: "13px 18px" }}>
                          {p.daysOfStock !== null ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              background: tier.bg, color: tier.color,
                              fontSize: 12, fontWeight: 700,
                              padding: "4px 10px", borderRadius: 99,
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: tier.dot, flexShrink: 0 }} />
                              {p.daysOfStock > 99 ? "99+d" : `${p.daysOfStock}d`}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "#334155" }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 16, display: "flex", gap: 24, flexWrap: "wrap" }}>
          {Object.entries(TIER_STYLE).map(([key, t]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.dot }} />
              {t.label}{key === "critical" ? " (<7d)" : key === "warning" ? " (7-14d)" : key === "healthy" ? " (14d+)" : " (no inventory tracking)"}
            </div>
          ))}
          <div style={{ fontSize: 12, color: "#334155" }}>🚨 = RTO rate &gt;15% — possible quality/listing issue</div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent, gradient, sub }: {
  icon: string; label: string; value: number; accent: string; gradient: string; sub: string
}) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 22px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: gradient, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: accent, letterSpacing: "-1px", lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginTop: 6 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  )
}
