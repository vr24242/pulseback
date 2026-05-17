import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import { requireShop } from "~/lib/shop.server"
import { getFinanceStats, type FinanceStats } from "~/services/finance.server"

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await requireShop(request)
  const url = new URL(request.url)
  const rangeParam = url.searchParams.get("range")
  const range = rangeParam === "7" ? 7 : rangeParam === "90" ? 90 : 30

  const stats = await getFinanceStats(shop.id, range)

  return json({ stats, range, shopDomain: shop.domain })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 10_00_000) return "₹" + (n / 10_00_000).toFixed(1) + "L"
  if (n >= 1_000) return "₹" + (n / 1_000).toFixed(1) + "k"
  return "₹" + Math.round(n).toLocaleString("en-IN")
}

function fmtFull(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN")
}

function pct(a: number, b: number) {
  if (b === 0) return "0%"
  return Math.round((a / b) * 100) + "%"
}

function carrierLabel(c: string) {
  const map: Record<string, string> = {
    shiprocket: "Shiprocket",
    delhivery: "Delhivery",
    bluedart: "BlueDart",
    xpressbees: "XpressBees",
    ecom: "Ecom Express",
    dtdc: "DTDC",
    unknown: "Unknown",
  }
  return map[c] ?? c
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const { stats, range, shopDomain } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const s = stats as FinanceStats

  function goRange(r: number) {
    navigate(`/app/finance?shop=${shopDomain}&range=${r}`)
  }

  const maxDayRev = Math.max(...s.dailyRevenue.map(d => d.revenue), 1)
  const wcPositive = s.workingCapital >= 0

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>

      {/* ── Hero header ────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f1f3d 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "32px 36px 28px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative orbs */}
        <div style={{
          position: "absolute", top: -60, right: -60, width: 220, height: 220,
          background: "radial-gradient(circle, rgba(108,99,255,0.25) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -40, left: 320, width: 140, height: 140,
          background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, #10b981, #059669)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, boxShadow: "0 4px 12px rgba(16,185,129,0.35)",
              }}>💰</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px", color: "#fff" }}>
                  Finance OS
                </h1>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  Revenue · COD float · Working capital · Loss analysis
                </p>
              </div>
            </div>
          </div>

          {/* Range selector */}
          <div style={{
            display: "flex", gap: 4,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 10, padding: 4,
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            {([7, 30, 90] as const).map(r => (
              <button
                key={r}
                onClick={() => goRange(r)}
                style={{
                  padding: "6px 16px", borderRadius: 7,
                  border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: range === r ? "rgba(108,99,255,0.9)" : "transparent",
                  color: range === r ? "#fff" : "#64748b",
                  transition: "all 0.15s",
                }}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 36px", maxWidth: 1280 }}>

        {/* ── Row 1: Revenue cards ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
          <StatCard
            icon="📈"
            label="Gross Revenue"
            value={fmt(s.grossRevenue)}
            subtitle={`${s.totalOrders} orders in ${range}d`}
            gradient="linear-gradient(135deg, rgba(108,99,255,0.18), rgba(108,99,255,0.05))"
            accent="#6c63ff"
          />
          <StatCard
            icon="🟡"
            label="COD Float"
            value={fmt(s.codFloat)}
            subtitle={`${s.codFloatOrders} orders · avg ${fmtFull(s.codFloatAvg)}`}
            gradient="linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.05))"
            accent="#f59e0b"
          />
          <StatCard
            icon="💳"
            label="Prepaid Revenue"
            value={fmt(s.prepaidRevenue)}
            subtitle={`${s.prepaidOrders} prepaid orders`}
            gradient="linear-gradient(135deg, rgba(59,130,246,0.18), rgba(59,130,246,0.05))"
            accent="#3b82f6"
          />
          <StatCard
            icon="✅"
            label="Net Revenue"
            value={fmt(s.netRevenue)}
            subtitle={`After ${fmtFull(s.rtoCost)} RTO cost`}
            gradient="linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.05))"
            accent="#10b981"
          />
        </div>

        {/* ── Row 2: Loss analysis ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
          <StatCard
            icon="🔴"
            label="RTO Cost"
            value={fmt(s.rtoCost)}
            subtitle={`${s.rtoOrders} orders · ${pct(s.rtoCost, s.grossRevenue)} of gross`}
            gradient="linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.05))"
            accent="#ef4444"
          />
          <StatCard
            icon="❌"
            label="Cancellation Loss"
            value={fmt(s.cancellationLoss)}
            subtitle={`${s.cancelledOrders} cancelled orders`}
            gradient="linear-gradient(135deg, rgba(249,115,22,0.18), rgba(249,115,22,0.05))"
            accent="#f97316"
          />
          <StatCard
            icon="↩️"
            label="Return Refunds"
            value={fmt(s.returnRefunds)}
            subtitle={`${s.returnCount} processed returns`}
            gradient="linear-gradient(135deg, rgba(168,85,247,0.18), rgba(168,85,247,0.05))"
            accent="#a855f7"
          />
        </div>

        {/* ── Row 3: Working capital gauge ──────────────────────────────────── */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <SectionHeader icon="⚖️" title="Working Capital Health" />
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <div style={{ flex: 1 }}>
              {/* Label bar */}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Working Capital</span>
                <span style={{
                  fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px",
                  color: wcPositive ? "#10b981" : "#ef4444",
                }}>
                  {wcPositive ? "+" : ""}{fmtFull(s.workingCapital)}
                </span>
              </div>
              {/* Gauge bar */}
              <div style={{
                height: 14, background: "rgba(255,255,255,0.07)",
                borderRadius: 99, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, Math.abs(s.workingCapital) / Math.max(s.prepaidRevenue, 1) * 100)}%`,
                  background: wcPositive
                    ? "linear-gradient(90deg, #10b981, #34d399)"
                    : "linear-gradient(90deg, #ef4444, #f87171)",
                  borderRadius: 99,
                  transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                }} />
              </div>
              {/* Formula */}
              <div style={{
                marginTop: 10, fontSize: 12, color: "#475569",
                display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
              }}>
                <FormulaChip label="Prepaid Revenue" value={fmtFull(s.prepaidRevenue)} color="#3b82f6" />
                <span style={{ color: "#374151" }}>−</span>
                <FormulaChip label="RTO Cost" value={fmtFull(s.rtoCost)} color="#ef4444" />
                <span style={{ color: "#374151" }}>−</span>
                <FormulaChip label="Return Refunds" value={fmtFull(s.returnRefunds)} color="#a855f7" />
                <span style={{ color: "#374151" }}>=</span>
                <FormulaChip
                  label="Working Capital"
                  value={fmtFull(s.workingCapital)}
                  color={wcPositive ? "#10b981" : "#ef4444"}
                />
              </div>
            </div>

            {/* Status badge */}
            <div style={{
              padding: "16px 24px", borderRadius: 12,
              background: wcPositive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${wcPositive ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
              textAlign: "center", flexShrink: 0,
            }}>
              <div style={{ fontSize: 28 }}>{wcPositive ? "🟢" : "🔴"}</div>
              <div style={{
                fontSize: 13, fontWeight: 700, marginTop: 6,
                color: wcPositive ? "#10b981" : "#ef4444",
              }}>
                {wcPositive ? "Healthy" : "Stressed"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 4: COD vs Prepaid split ──────────────────────────────────── */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <SectionHeader icon="💳" title="COD vs Prepaid Split" />
          {s.totalOrders === 0 ? (
            <EmptyState message="No orders in this period" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* COD bar */}
              <PaymentBar
                label="COD"
                count={s.codOrders}
                total={s.totalOrders}
                color="#f59e0b"
                bg="rgba(245,158,11,0.12)"
                icon="💵"
              />
              {/* Prepaid bar */}
              <PaymentBar
                label="Prepaid"
                count={s.prepaidOrders}
                total={s.totalOrders}
                color="#6c63ff"
                bg="rgba(108,99,255,0.12)"
                icon="💳"
              />
            </div>
          )}
        </div>

        {/* ── Row 5: Carrier breakdown table ───────────────────────────────── */}
        <div style={{ ...cardStyle, padding: 0, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "22px 24px 16px" }}>
            <SectionHeader icon="🚚" title="Payment by Carrier" />
          </div>
          {s.byCarrier.length === 0 ? (
            <div style={{ padding: "0 24px 24px" }}>
              <EmptyState message="No shipment data in this period" />
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Carrier", "Orders", "Revenue", "RTOs", "RTO Cost", "RTO Rate"].map(h => (
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
                  {s.byCarrier.map((c, i) => (
                    <tr
                      key={c.carrier}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                        background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.06)")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)")}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "#f1f5f9", fontSize: 13 }}>{carrierLabel(c.carrier)}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 13, color: "#cbd5e1" }}>{c.orders}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>{fmt(c.revenue)}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 13, color: c.rtos > 0 ? "#f97316" : "#4b5563" }}>{c.rtos}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 13, color: c.rtoCost > 0 ? "#ef4444" : "#4b5563" }}>{fmt(c.rtoCost)}</span>
                      </td>
                      <td style={tdStyle}>
                        <RtoRatePill rate={c.rtoRate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Row 6: Daily revenue trend ─────────────────────────────────────── */}
        <div style={{ ...cardStyle }}>
          <SectionHeader icon="📊" title={`Daily Revenue — Last ${Math.min(range, 30)} Days`} />
          {s.dailyRevenue.every(d => d.revenue === 0) ? (
            <EmptyState message="No revenue data in this period" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 6,
                height: 120,
                padding: "0 4px 0 4px",
                minWidth: s.dailyRevenue.length * 28,
              }}>
                {s.dailyRevenue.map(d => {
                  const barH = Math.max(4, (d.revenue / maxDayRev) * 100)
                  const isToday = d.date === new Date().toISOString().slice(0, 10)
                  return (
                    <div
                      key={d.date}
                      title={`${d.date}: ${fmtFull(d.revenue)} · ${d.orders} orders`}
                      style={{
                        flex: 1, minWidth: 20,
                        display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 4, cursor: "default",
                      }}
                    >
                      {/* Bar */}
                      <div style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "flex-end",
                      }}>
                        <div style={{
                          width: "100%",
                          height: `${barH}%`,
                          background: isToday
                            ? "linear-gradient(180deg, #10b981, #059669)"
                            : d.revenue > 0
                            ? "linear-gradient(180deg, #7c3aed, #6c63ff)"
                            : "rgba(255,255,255,0.06)",
                          borderRadius: "4px 4px 2px 2px",
                          transition: "height 0.4s cubic-bezier(0.4,0,0.2,1)",
                          boxShadow: d.revenue > 0 ? "0 0 8px rgba(108,99,255,0.3)" : "none",
                        }} />
                      </div>
                      {/* Day label */}
                      <span style={{
                        fontSize: 9, color: isToday ? "#6c63ff" : "#374151",
                        fontWeight: isToday ? 700 : 400,
                        whiteSpace: "nowrap",
                      }}>
                        {d.date.slice(5)} {/* MM-DD */}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 11, color: "#475569" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(135deg, #7c3aed, #6c63ff)" }} />
                  Revenue bar
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(135deg, #10b981, #059669)" }} />
                  Today
                </div>
                <div style={{ flex: 1, textAlign: "right" }}>
                  Hover bars for details
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, subtitle, gradient, accent }: {
  icon: string; label: string; value: string;
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
        <div style={{ fontSize: 26, fontWeight: 800, color: accent, letterSpacing: "-0.8px", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginTop: 6 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{subtitle}</div>
      </div>
      <div style={{
        position: "absolute", bottom: -20, right: -20, width: 80, height: 80,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
    </div>
  )
}

function PaymentBar({ label, count, total, color, bg, icon }: {
  label: string; count: number; total: number; color: string; bg: string; icon: string
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{label}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: "-0.5px" }}>{percentage}%</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{count} orders</div>
        </div>
      </div>
      <div style={{ height: 12, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${percentage}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 99,
          transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: `0 0 8px ${color}44`,
        }} />
      </div>
      <div style={{
        marginTop: 6, fontSize: 11, color: "#475569",
        padding: "4px 10px", borderRadius: 8, background: bg, display: "inline-block",
      }}>
        {percentage}% of total orders
      </div>
    </div>
  )
}

function RtoRatePill({ rate }: { rate: number }) {
  const color = rate >= 20 ? "#ef4444" : rate >= 10 ? "#f97316" : rate > 0 ? "#eab308" : "#4b5563"
  const bg = rate >= 20 ? "rgba(239,68,68,0.12)" : rate >= 10 ? "rgba(249,115,22,0.12)" : rate > 0 ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.04)"
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px", borderRadius: 99,
      background: bg, color, fontSize: 11, fontWeight: 700,
    }}>
      {rate}%
    </span>
  )
}

function FormulaChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", flexDirection: "column", alignItems: "center",
      padding: "4px 10px", borderRadius: 8,
      background: `${color}18`,
      border: `1px solid ${color}33`,
    }}>
      <span style={{ fontSize: 10, color: "#475569", marginBottom: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
    </span>
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
    <div style={{ textAlign: "center", padding: "32px 0", color: "#475569", fontSize: 13 }}>
      {message}
    </div>
  )
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
