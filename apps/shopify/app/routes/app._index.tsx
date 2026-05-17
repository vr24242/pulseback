import type React from "react"
import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import { db } from "@d2c/database"
import { requireShop } from "../lib/shop.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const shopDomain = url.searchParams.get("shop") ?? ""
  const shop = await requireShop(request)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    totalCustomers, totalOrders, atRiskCount, todayRevenue,
    codOrders, rtoOrders, abandonedToday,
  ] = await Promise.all([
    db.customer.count({ where: { shopId: shop.id } }),
    db.order.count({ where: { shopId: shop.id } }),
    db.customer.count({ where: { shopId: shop.id, lifecycleStage: "at_risk" } }),
    db.order.aggregate({
      where: { shopId: shop.id, createdAt: { gte: today }, status: { notIn: ["cancelled"] } },
      _sum: { totalPrice: true },
    }),
    db.order.count({ where: { shopId: shop.id, paymentMethod: "cod", createdAt: { gte: today } } }),
    db.order.count({ where: { shopId: shop.id, isRTO: true } }),
    db.checkoutSession.count({
      where: { shopId: shop.id, status: "abandoned", abandonedAt: { gte: today } },
    }),
  ])

  const recentCustomers = await db.customer.findMany({
    where: { shopId: shop.id },
    orderBy: { lastSeenAt: "desc" },
    take: 8,
    select: {
      id: true, name: true, phone: true, email: true,
      lifecycleStage: true, ltvTier: true, totalOrders: true,
      totalSpend: true, rtoRiskScore: true, lastSeenAt: true,
    },
  })

  return json({
    shopName: shop.name ?? shopDomain,
    shopDomain,
    stats: {
      totalCustomers,
      totalOrders,
      atRiskCount,
      todayRevenue: todayRevenue._sum.totalPrice ?? 0,
      codOrders,
      rtoOrders,
      abandonedToday,
    },
    recentCustomers,
  })
}

// ─── helpers ────────────────────────────────────────────────────────────────

function stagePill(stage: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    new:      { bg: "rgba(108,99,255,0.18)",  color: "#a89aff", label: "new" },
    prospect: { bg: "rgba(108,99,255,0.18)",  color: "#a89aff", label: "prospect" },
    active:   { bg: "rgba(16,185,129,0.18)",  color: "#34d399", label: "active" },
    champion: { bg: "rgba(245,158,11,0.18)",  color: "#fbbf24", label: "champion" },
    at_risk:  { bg: "rgba(245,158,11,0.18)",  color: "#fbbf24", label: "at risk" },
    lapsed:   { bg: "rgba(239,68,68,0.18)",   color: "#f87171", label: "lapsed" },
    churned:  { bg: "rgba(239,68,68,0.18)",   color: "#f87171", label: "churned" },
  }
  return map[stage] ?? { bg: "rgba(255,255,255,0.08)", color: "rgba(232,232,240,0.6)", label: stage.replace("_", " ") }
}

function tierPill(tier: string) {
  const map: Record<string, { bg: string; color: string }> = {
    new:  { bg: "rgba(108,99,255,0.18)", color: "#a89aff" },
    low:  { bg: "rgba(59,130,246,0.18)", color: "#60a5fa" },
    mid:  { bg: "rgba(20,184,166,0.18)", color: "#2dd4bf" },
    high: { bg: "rgba(16,185,129,0.18)", color: "#34d399" },
    vip:  { bg: "rgba(245,158,11,0.18)", color: "#fbbf24" },
  }
  return map[tier] ?? { bg: "rgba(255,255,255,0.08)", color: "rgba(232,232,240,0.6)" }
}

function rtoPill(score: number) {
  if (score > 60) return { bg: "rgba(239,68,68,0.18)",  color: "#f87171" }
  if (score > 40) return { bg: "rgba(245,158,11,0.18)", color: "#fbbf24" }
  return              { bg: "rgba(16,185,129,0.18)",  color: "#34d399" }
}

// ─── component ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { shopName, shopDomain, stats, recentCustomers } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning ☀️" : hour < 17 ? "Good afternoon 🌤️" : "Good evening 🌙"

  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const s = styles

  return (
    <div style={s.page}>
      <div style={s.container}>

        {/* ── Hero header ─────────────────────────────────────── */}
        <div style={s.hero}>
          <div>
            <p style={s.greeting}>{greeting}</p>
            <h1 style={s.shopName}>{shopName}</h1>
          </div>
          <div style={s.heroRight}>
            <p style={s.subtitle}>D2C Operating System</p>
            <p style={s.date}>{todayFormatted}</p>
          </div>
        </div>

        {/* ── Primary KPI row ─────────────────────────────────── */}
        <div style={s.kpiGrid}>
          <KpiCard
            label="Today's Revenue"
            value={`₹${Number(stats.todayRevenue).toLocaleString("en-IN")}`}
            valueColor={Number(stats.todayRevenue) > 0 ? "#34d399" : undefined}
          />
          <KpiCard
            label="COD Orders Today"
            value={stats.codOrders.toString()}
            valueColor={stats.codOrders > 0 ? "#fbbf24" : undefined}
          />
          <KpiCard
            label="Abandoned Today"
            value={stats.abandonedToday.toString()}
            valueColor={stats.abandonedToday > 0 ? "#f87171" : undefined}
            onClick={stats.abandonedToday > 0 ? () => navigate(`/app/orders?shop=${shopDomain}`) : undefined}
          />
          <KpiCard
            label="At-Risk Customers"
            value={stats.atRiskCount.toString()}
            valueColor={stats.atRiskCount > 0 ? "#fbbf24" : undefined}
            onClick={stats.atRiskCount > 0 ? () => navigate(`/app/customers?shop=${shopDomain}`) : undefined}
          />
        </div>

        {/* ── Secondary stats row ─────────────────────────────── */}
        <div style={s.secondaryGrid}>
          <SecondaryCard
            label="Total Customers"
            value={stats.totalCustomers.toLocaleString("en-IN")}
            sub="across all time"
          />
          <SecondaryCard
            label="Total Orders"
            value={stats.totalOrders.toLocaleString("en-IN")}
            sub="all time"
          />
          <SecondaryCard
            label="RTO Orders"
            value={stats.rtoOrders.toString()}
            sub="returned to origin"
            valueColor={stats.rtoOrders > 0 ? "#f87171" : undefined}
          />
        </div>

        {/* ── Quick actions ────────────────────────────────────── */}
        <div style={s.actionsRow}>
          <ActionBtn label="📦 View NDR"   onClick={() => navigate(`/app/ndr?shop=${shopDomain}`)} />
          <ActionBtn label="↩️ Returns"    onClick={() => navigate(`/app/returns?shop=${shopDomain}`)} />
          <ActionBtn label="📣 Broadcast"  onClick={() => navigate(`/app/marketing?shop=${shopDomain}`)} />
          <ActionBtn
            label="🤖 Ask Claude"
            onClick={() => navigate(`/app/chat?shop=${shopDomain}`)}
            primary
          />
        </div>

        {/* ── Recent Customers table ───────────────────────────── */}
        <div style={s.tableCard}>
          <div style={s.tableHeader}>
            <span style={s.tableTitle}>Recent Customers</span>
            <button
              style={s.viewAllBtn}
              onClick={() => navigate(`/app/customers?shop=${shopDomain}`)}
            >
              View all →
            </button>
          </div>

          {recentCustomers.length === 0 ? (
            <div style={s.emptyState}>
              <p style={s.emptyMain}>No customers yet</p>
              <p style={s.emptySub}>
                Customers appear here when they place orders or start a checkout.
              </p>
            </div>
          ) : (
            <div style={s.tableWrapper}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Customer", "Stage", "LTV Tier", "Orders", "Spend", "RTO Score"].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentCustomers.map((c) => {
                    const sp = stagePill(c.lifecycleStage)
                    const tp = tierPill(c.ltvTier)
                    const rp = rtoPill(c.rtoRiskScore)
                    const displayName = c.name ?? c.phone ?? c.email ?? "—"
                    return (
                      <tr
                        key={c.id}
                        style={s.tr}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.04)"
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background = "transparent"
                        }}
                      >
                        <td style={s.td}>
                          <span style={s.customerName}>{displayName}</span>
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.pill, background: sp.bg, color: sp.color }}>
                            {sp.label}
                          </span>
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.pill, background: tp.bg, color: tp.color }}>
                            {c.ltvTier}
                          </span>
                        </td>
                        <td style={{ ...s.td, ...s.tdNum }}>{c.totalOrders}</td>
                        <td style={{ ...s.td, ...s.tdNum }}>
                          ₹{Number(c.totalSpend).toLocaleString("en-IN")}
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.pill, background: rp.bg, color: rp.color }}>
                            {c.rtoRiskScore}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label, value, valueColor, onClick,
}: {
  label: string
  value: string
  valueColor?: string
  onClick?: () => void
}) {
  const s = styles
  const isClickable = !!onClick
  return (
    <div
      style={{
        ...s.card,
        cursor: isClickable ? "pointer" : "default",
        transition: "background 0.15s",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (isClickable)
          (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.07)"
      }}
      onMouseLeave={(e) => {
        if (isClickable)
          (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"
      }}
    >
      <p style={s.kpiLabel}>{label}</p>
      <p style={{ ...s.kpiValue, ...(valueColor ? { color: valueColor } : {}) }}>{value}</p>
      {isClickable && <span style={s.arrow}>→</span>}
    </div>
  )
}

function SecondaryCard({
  label, value, sub, valueColor,
}: {
  label: string
  value: string
  sub: string
  valueColor?: string
}) {
  const s = styles
  return (
    <div style={s.card}>
      <p style={s.kpiLabel}>{label}</p>
      <p style={{ ...s.secondaryValue, ...(valueColor ? { color: valueColor } : {}) }}>{value}</p>
      <p style={s.cardSub}>{sub}</p>
    </div>
  )
}

function ActionBtn({
  label, onClick, primary,
}: {
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      style={{
        background: primary ? "rgba(108,99,255,0.25)" : "rgba(255,255,255,0.06)",
        color: primary ? "#c4beff" : "#e8e8f0",
        border: primary ? "1px solid rgba(108,99,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: primary ? 600 : 400,
        cursor: "pointer",
        transition: "background 0.15s",
        fontFamily: "inherit",
        whiteSpace: "nowrap" as const,
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = primary
          ? "rgba(108,99,255,0.38)"
          : "rgba(255,255,255,0.1)"
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = primary
          ? "rgba(108,99,255,0.25)"
          : "rgba(255,255,255,0.06)"
      }}
    >
      {label}
    </button>
  )
}

// ─── styles object ───────────────────────────────────────────────────────────

const styles = {
  page: {
    background: "#0f0f13",
    minHeight: "100vh",
    padding: "24px 16px 48px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#e8e8f0",
  } as React.CSSProperties,

  container: {
    maxWidth: 1100,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
  } as React.CSSProperties,

  // hero
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: 12,
    padding: "24px 28px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
  } as React.CSSProperties,

  greeting: {
    margin: 0,
    fontSize: 14,
    color: "rgba(232,232,240,0.5)",
    marginBottom: 4,
  } as React.CSSProperties,

  shopName: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    background: "linear-gradient(135deg, #a89aff 0%, #6c63ff 60%, #b06cff 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    lineHeight: 1.2,
  } as React.CSSProperties,

  heroRight: {
    textAlign: "right" as const,
  } as React.CSSProperties,

  subtitle: {
    margin: 0,
    fontSize: 12,
    color: "rgba(232,232,240,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: 4,
  } as React.CSSProperties,

  date: {
    margin: 0,
    fontSize: 13,
    color: "rgba(232,232,240,0.55)",
  } as React.CSSProperties,

  // grids
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
  } as React.CSSProperties,

  secondaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 14,
  } as React.CSSProperties,

  // card shared
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: "18px 20px",
    position: "relative" as const,
  } as React.CSSProperties,

  kpiLabel: {
    margin: 0,
    fontSize: 12,
    color: "rgba(232,232,240,0.5)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 8,
  } as React.CSSProperties,

  kpiValue: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    color: "#e8e8f0",
    lineHeight: 1,
  } as React.CSSProperties,

  secondaryValue: {
    margin: 0,
    fontSize: 22,
    fontWeight: 600,
    color: "#e8e8f0",
    lineHeight: 1,
    marginBottom: 4,
  } as React.CSSProperties,

  cardSub: {
    margin: 0,
    marginTop: 4,
    fontSize: 11,
    color: "rgba(232,232,240,0.35)",
  } as React.CSSProperties,

  arrow: {
    position: "absolute" as const,
    right: 16,
    top: "50%",
    transform: "translateY(-50%)",
    color: "rgba(232,232,240,0.3)",
    fontSize: 16,
  } as React.CSSProperties,

  // actions
  actionsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const,
  } as React.CSSProperties,

  // table card
  tableCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    overflow: "hidden",
  } as React.CSSProperties,

  tableHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  } as React.CSSProperties,

  tableTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#e8e8f0",
  } as React.CSSProperties,

  viewAllBtn: {
    background: "transparent",
    border: "none",
    color: "#8b83ff",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  } as React.CSSProperties,

  tableWrapper: {
    overflowX: "auto" as const,
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  } as React.CSSProperties,

  th: {
    padding: "10px 16px",
    textAlign: "left" as const,
    fontSize: 11,
    fontWeight: 500,
    color: "rgba(232,232,240,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,

  tr: {
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    transition: "background 0.1s",
    cursor: "default",
  } as React.CSSProperties,

  td: {
    padding: "12px 16px",
    verticalAlign: "middle" as const,
    color: "#e8e8f0",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,

  tdNum: {
    fontVariantNumeric: "tabular-nums" as const,
    color: "rgba(232,232,240,0.8)",
  } as React.CSSProperties,

  customerName: {
    fontWeight: 500,
    color: "#e8e8f0",
  } as React.CSSProperties,

  pill: {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.02em",
  } as React.CSSProperties,

  // empty state
  emptyState: {
    padding: "52px 20px",
    textAlign: "center" as const,
  } as React.CSSProperties,

  emptyMain: {
    margin: 0,
    fontSize: 15,
    color: "rgba(232,232,240,0.4)",
    marginBottom: 6,
  } as React.CSSProperties,

  emptySub: {
    margin: 0,
    fontSize: 12,
    color: "rgba(232,232,240,0.25)",
  } as React.CSSProperties,
} satisfies Record<string, React.CSSProperties>
