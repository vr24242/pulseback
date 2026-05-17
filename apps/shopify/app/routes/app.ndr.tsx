import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import { requireShop } from "~/lib/shop.server"
import {
  getNdrStats,
  getNdrShipments,
  type NdrFilter,
  type NdrShipment,
  type NdrStats,
} from "~/services/ndr.server"

const NDR_PAGE_SIZE = 20

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await requireShop(request)
  const url = new URL(request.url)
  const filter = (url.searchParams.get("filter") ?? "stuck") as NdrFilter
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10))
  const shopDomain = shop.domain

  const [stats, { shipments, total }] = await Promise.all([
    getNdrStats(shop.id),
    getNdrShipments(shop.id, filter, page),
  ])

  return json({ stats, shipments, total, filter, page, shopDomain })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stuckDays(iso: string | null) {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (h < 1) return "Just now"
  if (h < 24) return `${h}h ago`
  if (d === 1) return "Yesterday"
  return `${d}d ago`
}

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

function carrierLabel(c: string) {
  return ({ shiprocket: "Shiprocket", delhivery: "Delhivery", bluedart: "BlueDart", xpressbees: "XpressBees", ecom: "Ecom Express", dtdc: "DTDC" } as Record<string, string>)[c] ?? c
}

function urgencyTier(days: number): "critical" | "high" | "moderate" {
  if (days >= 5) return "critical"
  if (days >= 3) return "high"
  return "moderate"
}

const URGENCY = {
  critical: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", dot: "#ef4444" },
  high:     { bg: "rgba(249,115,22,0.12)", text: "#f97316", dot: "#f97316" },
  moderate: { bg: "rgba(234,179,8,0.12)",  text: "#ca8a04", dot: "#eab308" },
}

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  created:           { label: "Created",          bg: "rgba(107,114,128,0.12)", color: "#6b7280" },
  in_transit:        { label: "In Transit",       bg: "rgba(59,130,246,0.12)",  color: "#3b82f6" },
  out_for_delivery:  { label: "Out for Delivery", bg: "rgba(16,185,129,0.12)",  color: "#10b981" },
  delivered:         { label: "Delivered",        bg: "rgba(22,163,74,0.12)",   color: "#16a34a" },
  failed_delivery:   { label: "Failed",           bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  rto_initiated:     { label: "RTO Initiated",    bg: "rgba(249,115,22,0.12)",  color: "#f97316" },
  rto_delivered:     { label: "RTO Delivered",    bg: "rgba(234,179,8,0.12)",   color: "#ca8a04" },
  exception:         { label: "Exception",        bg: "rgba(168,85,247,0.12)",  color: "#a855f7" },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NdrDashboard() {
  const { stats, shipments, total, filter, page, shopDomain } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const ndrShipments = shipments as NdrShipment[]
  const ndrStats = stats as NdrStats

  const totalPages = Math.ceil(total / NDR_PAGE_SIZE)

  function go(f: string, p = 1) {
    navigate(`/app/ndr?shop=${shopDomain}&filter=${f}&page=${p}`)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "32px 36px 28px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative orbs */}
        <div style={{
          position: "absolute", top: -60, right: -60, width: 200, height: 200,
          background: "radial-gradient(circle, rgba(108,99,255,0.3) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -40, left: 300, width: 150, height: 150,
          background: "radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #6c63ff, #a855f7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>📦</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px", color: "#fff" }}>
                NDR Command Center
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                Non-delivery · Stuck shipments · RTO prevention
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 36px", maxWidth: 1280 }}>

        {/* ── Stat cards ───────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          <StatCard
            icon="🔴"
            label="Stuck Now"
            value={ndrStats.totalStuck}
            subtitle="Need immediate attention"
            gradient="linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))"
            accent="#ef4444"
          />
          <StatCard
            icon="⚠️"
            label="RTO Risk"
            value={ndrStats.totalRtoRisk}
            subtitle="Return in progress"
            gradient="linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.05))"
            accent="#f97316"
          />
          <StatCard
            icon="✅"
            label="Resolved"
            value={`${ndrStats.resolutionRate}%`}
            subtitle={`${ndrStats.totalResolved} delivered after NDR`}
            gradient="linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))"
            accent="#10b981"
          />
          <StatCard
            icon="📨"
            label="Avg NDR Attempts"
            value={ndrStats.avgAttemptsBeforeResolution || "—"}
            subtitle="Before delivery"
            gradient="linear-gradient(135deg, rgba(108,99,255,0.15), rgba(108,99,255,0.05))"
            accent="#6c63ff"
          />
        </div>

        {/* ── Breakdown row ─────────────────────────────────────────────────────── */}
        {(ndrStats.byCarrier.length > 0 || true) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>

            {/* Carrier breakdown */}
            <div style={cardStyle}>
              <SectionHeader icon="🚚" title="Carrier Breakdown" />
              {ndrStats.byCarrier.length === 0 ? (
                <EmptyState message="No NDR data yet" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ndrStats.byCarrier.map(c => {
                    const total = c.stuck + c.rto
                    return (
                      <div key={c.carrier} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px", borderRadius: 10,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", minWidth: 96 }}>
                          {carrierLabel(c.carrier)}
                        </div>
                        <div style={{ flex: 1, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {c.stuck > 0 && (
                            <span style={badgeStyle("rgba(239,68,68,0.15)", "#ef4444")}>
                              {c.stuck} stuck
                            </span>
                          )}
                          {c.rto > 0 && (
                            <span style={badgeStyle("rgba(249,115,22,0.15)", "#f97316")}>
                              {c.rto} RTO
                            </span>
                          )}
                          {c.resolved > 0 && (
                            <span style={badgeStyle("rgba(16,185,129,0.15)", "#10b981")}>
                              {c.resolved} ✓
                            </span>
                          )}
                          {total === 0 && c.resolved === 0 && (
                            <span style={{ fontSize: 12, color: "#4b5563" }}>—</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Failed attempts */}
            <div style={cardStyle}>
              <SectionHeader icon="🎯" title="Failed Delivery Attempts" />
              <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0" }}>
                {ndrStats.byFailedAttempts.map(({ label, count }) => {
                  const maxCount = Math.max(...ndrStats.byFailedAttempts.map(b => b.count), 1)
                  const pct = (count / maxCount) * 100
                  const color = label === "1" ? "#eab308" : label === "2" ? "#f97316" : "#ef4444"
                  return (
                    <div key={label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: "#94a3b8" }}>
                          {label} attempt{label !== "1" ? "s" : ""}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color }}>{count}</span>
                      </div>
                      <div style={{
                        height: 6, background: "rgba(255,255,255,0.07)",
                        borderRadius: 99, overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: `linear-gradient(90deg, ${color}88, ${color})`,
                          borderRadius: 99,
                          transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Shipments table ───────────────────────────────────────────────────── */}
        <div style={cardStyle}>
          {/* Table header / tabs */}
          <div style={{
            display: "flex", alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            padding: "0 24px",
            gap: 4,
          }}>
            {[
              { key: "stuck", label: "Stuck", count: ndrStats.totalStuck },
              { key: "rto",   label: "RTO Risk", count: ndrStats.totalRtoRisk },
              { key: "all",   label: "All Failed", count: null },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => go(tab.key)}
                style={{
                  background: "none", border: "none",
                  padding: "16px 14px",
                  fontSize: 13, cursor: "pointer",
                  color: filter === tab.key ? "#6c63ff" : "#64748b",
                  fontWeight: filter === tab.key ? 600 : 400,
                  borderBottom: `2px solid ${filter === tab.key ? "#6c63ff" : "transparent"}`,
                  marginBottom: -1,
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "color 0.15s",
                }}
              >
                {tab.label}
                {tab.count !== null && tab.count > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, minWidth: 20, height: 20,
                    background: filter === tab.key ? "rgba(108,99,255,0.2)" : "rgba(255,255,255,0.07)",
                    color: filter === tab.key ? "#6c63ff" : "#64748b",
                    borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "0 6px",
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "#475569" }}>
              {total} total · page {page}/{totalPages || 1}
            </span>
          </div>

          {/* Table */}
          {ndrShipments.length === 0 ? (
            <div style={{ padding: 64, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0" }}>All clear!</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
                {filter === "stuck"
                  ? "No stuck shipments — delivery performance is healthy."
                  : filter === "rto"
                  ? "No RTO risk detected right now."
                  : "No failed deliveries on record."}
              </div>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Order", "Customer", "AWB · Carrier", "Stuck", "Fails", "NDR", "Status", ""].map(h => (
                        <th key={h} style={{
                          padding: "10px 20px", textAlign: "left",
                          fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                          textTransform: "uppercase", color: "#475569",
                          background: "rgba(255,255,255,0.02)",
                          borderBottom: "1px solid rgba(255,255,255,0.07)",
                          whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ndrShipments.map((s, i) => (
                      <ShipmentRow key={s.id} s={s} i={i} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>
                    Showing {(page - 1) * NDR_PAGE_SIZE + 1}–{Math.min(page * NDR_PAGE_SIZE, total)} of {total}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    {page > 1 && (
                      <PaginationBtn label="← Prev" onClick={() => go(filter, page - 1)} />
                    )}
                    {page < totalPages && (
                      <PaginationBtn label="Next →" onClick={() => go(filter, page + 1)} />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 16, display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { dot: "#ef4444", label: "5+ days — critical" },
            { dot: "#f97316", label: "3–4 days — high" },
            { dot: "#eab308", label: "1–2 days — moderate" },
            { dot: "#6c63ff", label: "📨 = WhatsApp NDR message sent" },
          ].map(({ dot, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ShipmentRow({ s, i }: { s: NdrShipment; i: number }) {
  const days = stuckDays(s.stuckSince)
  const tier = urgencyTier(days)
  const urg = URGENCY[tier]
  const addr = s.order.shippingAddress
  const city = addr?.city ?? addr?.City ?? addr?.city_name ?? ""
  const statusPill = STATUS_MAP[s.status] ?? { label: s.status, bg: "rgba(107,114,128,0.12)", color: "#6b7280" }

  return (
    <tr style={{
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
      transition: "background 0.1s",
    }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.06)")}
      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)")}
    >
      {/* Order */}
      <td style={tdStyle}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#f1f5f9" }}>
          {s.order.shopifyOrderName}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
          {formatINR(s.order.totalPrice)} · <span style={{
            color: s.order.paymentMethod === "cod" ? "#f97316" : "#10b981",
            fontWeight: 500,
          }}>{s.order.paymentMethod.toUpperCase()}</span>
        </div>
      </td>

      {/* Customer */}
      <td style={tdStyle}>
        <div style={{ fontSize: 13, color: "#cbd5e1" }}>{s.order.customer?.name ?? "—"}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
          {s.order.customer?.phone ?? "—"}
          {city ? ` · ${city}` : ""}
        </div>
      </td>

      {/* AWB */}
      <td style={tdStyle}>
        <div style={{ fontSize: 12, fontFamily: "monospace", color: "#94a3b8", letterSpacing: "0.02em" }}>
          {s.awb}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{carrierLabel(s.carrier)}</div>
      </td>

      {/* Stuck since */}
      <td style={tdStyle}>
        {s.isStuck && s.stuckSince ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 99,
            background: urg.bg, color: urg.text,
            fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: urg.dot, flexShrink: 0 }} />
            {days}d
          </span>
        ) : s.rtoInitiatedAt ? (
          <span style={{ fontSize: 12, color: "#f97316" }}>RTO</span>
        ) : (
          <span style={{ fontSize: 12, color: "#334155" }}>—</span>
        )}
      </td>

      {/* Failed attempts */}
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <AttemptDots count={s.failedAttempts} />
      </td>

      {/* NDR sent */}
      <td style={tdStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: s.ndrAttempts > 0 ? "#6c63ff" : "#334155" }}>
          {s.ndrAttempts > 0 ? `${s.ndrAttempts}×` : "—"}
        </div>
        {s.lastNdrAt && (
          <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{timeAgo(s.lastNdrAt)}</div>
        )}
      </td>

      {/* Status */}
      <td style={tdStyle}>
        <span style={{
          display: "inline-block",
          padding: "3px 10px", borderRadius: 99,
          background: statusPill.bg, color: statusPill.color,
          fontSize: 11, fontWeight: 600,
        }}>
          {statusPill.label}
        </span>
        {s.rawStatus && s.rawStatus !== s.status && (
          <div style={{ fontSize: 10, color: "#334155", marginTop: 3, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.rawStatus}
          </div>
        )}
      </td>

      {/* Actions */}
      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
        {s.isStuck && !s.rtoInitiatedAt && (
          <button style={{
            background: "rgba(108,99,255,0.15)", color: "#6c63ff",
            border: "1px solid rgba(108,99,255,0.3)", borderRadius: 8,
            padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>
            📨 Resend
          </button>
        )}
        {s.failedAttempts >= 3 && !s.rtoInitiatedAt && (
          <span style={{
            display: "inline-block", marginLeft: 6,
            background: "rgba(239,68,68,0.1)", color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8,
            padding: "5px 10px", fontSize: 11, fontWeight: 600,
          }}>
            🚨 RTO risk
          </span>
        )}
      </td>
    </tr>
  )
}

function AttemptDots({ count }: { count: number }) {
  const color = count >= 3 ? "#ef4444" : count === 2 ? "#f97316" : "#eab308"
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
      {[1, 2, 3].map(n => (
        <div key={n} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: n <= count ? color : "rgba(255,255,255,0.1)",
          boxShadow: n <= count ? `0 0 6px ${color}88` : "none",
          transition: "all 0.2s",
        }} />
      ))}
      {count > 3 && (
        <span style={{ fontSize: 11, color, fontWeight: 700, marginLeft: 2 }}>+{count - 3}</span>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, subtitle, gradient, accent }: {
  icon: string; label: string; value: string | number;
  subtitle: string; gradient: string; accent: string
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "20px 22px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: 16,
        background: gradient, pointerEvents: "none",
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: accent, letterSpacing: "-1px", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginTop: 6 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{subtitle}</div>
      </div>
      {/* Corner accent */}
      <div style={{
        position: "absolute", bottom: -20, right: -20, width: 80, height: 80,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
    </div>
  )
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>{title}</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "24px 0", color: "#475569", fontSize: 13 }}>
      {message}
    </div>
  )
}

function PaginationBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.06)", color: "#94a3b8",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8, padding: "6px 16px",
        fontSize: 12, fontWeight: 500, cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(108,99,255,0.15)"; e.currentTarget.style.color = "#6c63ff" }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#94a3b8" }}
    >
      {label}
    </button>
  )
}

function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 600,
    padding: "3px 9px", borderRadius: 99,
    background: bg, color,
    display: "inline-block",
  }
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  overflow: "hidden",
  padding: "22px 24px",
}

const tdStyle: React.CSSProperties = {
  padding: "14px 20px",
  verticalAlign: "middle",
}
