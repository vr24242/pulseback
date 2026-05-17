import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import { db } from "@d2c/database"
import { requireShop } from "../lib/shop.server"

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const customerId = params.id ?? ""

  const shop = await requireShop(request)
  const shopDomain = shop.domain

  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId: shop.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      city: true,
      state: true,
      pincode: true,
      lifecycleStage: true,
      ltvTier: true,
      totalOrders: true,
      totalSpend: true,
      averageOrderValue: true,
      ltv: true,
      rtoRiskScore: true,
      churnScore: true,
      totalReturns: true,
      returnRate: true,
      firstSeenAt: true,
      lastSeenAt: true,
      lastOrderAt: true,
      acquisitionSource: true,
      acquisitionMedium: true,
      acquisitionCampaign: true,
    },
  })
  if (!customer) throw new Response("Customer not found", { status: 404 })

  const [orders, timeline] = await Promise.all([
    db.order.findMany({
      where: { customerId, shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        shopifyOrderName: true,
        totalPrice: true,
        paymentMethod: true,
        status: true,
        rtoRisk: true,
        isRTO: true,
        createdAt: true,
      },
    }),
    db.timelineEvent.findMany({
      where: { customerId, shopId: shop.id },
      orderBy: { occurredAt: "desc" },
      take: 30,
      select: {
        id: true,
        eventType: true,
        title: true,
        occurredAt: true,
      },
    }),
  ])

  return json({ customer, orders, timeline, shopDomain })
}

const EVENT_ICON: Record<string, string> = {
  "order.placed": "🛒",
  "order.confirmed": "✅",
  "order.dispatched": "📦",
  "order.delivered": "🎉",
  "order.cancelled": "❌",
  "order.returned": "↩️",
  "checkout.abandoned": "🛒",
  "retention.churn_risk_detected": "⚠️",
  "shipment.stuck": "🚨",
  "shipment.out_for_delivery": "🚚",
  "shipment.delivered": "🎉",
}

const STAGE_COLORS: Record<string, { bg: string; color: string }> = {
  new:      { bg: "rgba(108,99,255,0.18)", color: "#a89dff" },
  prospect: { bg: "rgba(108,99,255,0.18)", color: "#a89dff" },
  active:   { bg: "rgba(34,197,94,0.15)",  color: "#4ade80" },
  champion: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  at_risk:  { bg: "rgba(251,146,60,0.15)", color: "#fb923c" },
  lapsed:   { bg: "rgba(239,68,68,0.15)",  color: "#f87171" },
  churned:  { bg: "rgba(239,68,68,0.15)",  color: "#f87171" },
}

const LTV_COLORS: Record<string, { bg: string; color: string }> = {
  new:  { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  low:  { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
  mid:  { bg: "rgba(20,184,166,0.15)",  color: "#2dd4bf" },
  high: { bg: "rgba(34,197,94,0.15)",   color: "#4ade80" },
  vip:  { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b" },
}

function scorePillStyle(score: number) {
  if (score < 40) return { bg: "rgba(34,197,94,0.15)",  color: "#4ade80", bar: "#4ade80" }
  if (score < 60) return { bg: "rgba(251,146,60,0.15)", color: "#fb923c", bar: "#fb923c" }
  return                 { bg: "rgba(239,68,68,0.15)",  color: "#f87171", bar: "#f87171" }
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  placed:     { bg: "rgba(108,99,255,0.18)", color: "#a89dff" },
  confirmed:  { bg: "rgba(108,99,255,0.18)", color: "#a89dff" },
  packed:     { bg: "rgba(108,99,255,0.18)", color: "#a89dff" },
  dispatched: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  delivered:  { bg: "rgba(34,197,94,0.15)",  color: "#4ade80" },
  cancelled:  { bg: "rgba(239,68,68,0.15)",  color: "#f87171" },
  returned:   { bg: "rgba(251,146,60,0.15)", color: "#fb923c" },
}

function getInitials(name: string | null, phone: string | null, email: string | null) {
  const n = name ?? email ?? phone ?? "?"
  return n.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
}

function daysSince(date: string | Date | null) {
  if (!date) return null
  const ms = Date.now() - new Date(date).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 24,
} as const

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ fontSize: 12, color: "rgba(232,232,240,0.45)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#e8e8f0", fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  )
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const s = scorePillStyle(score)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "rgba(232,232,240,0.5)" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{score} / 100</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${score}%`,
          background: s.bar,
          borderRadius: 3,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  )
}

export default function CustomerDetail() {
  const { customer, orders, timeline, shopDomain } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  const displayName = customer.name ?? customer.phone ?? customer.email ?? "Unknown"
  const initials = getInitials(customer.name, customer.phone, customer.email)
  const daysAgo = daysSince(customer.lastOrderAt)

  const stageStyle = STAGE_COLORS[customer.lifecycleStage] ?? { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" }
  const ltvStyle = LTV_COLORS[customer.ltvTier] ?? { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13", padding: "32px 24px", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* Back link */}
      <button
        onClick={() => navigate(`/app/customers?shop=${shopDomain}`)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: "rgba(232,232,240,0.5)",
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          marginBottom: 24,
        }}
      >
        ← Customers
      </button>

      {/* Hero card */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>

          {/* Left: avatar + name */}
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6c63ff 0%, #9c92ff 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e8e8f0", margin: 0 }}>{displayName}</h1>
              <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                {customer.phone && (
                  <span style={{ fontSize: 13, color: "rgba(232,232,240,0.5)" }}>{customer.phone}</span>
                )}
                {customer.email && (
                  <span style={{ fontSize: 13, color: "rgba(232,232,240,0.5)" }}>{customer.email}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: pills + last order */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: stageStyle.bg, color: stageStyle.color, textTransform: "capitalize" }}>
                {customer.lifecycleStage.replace(/_/g, " ")}
              </span>
              <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: ltvStyle.bg, color: ltvStyle.color, textTransform: "capitalize" }}>
                {customer.ltvTier} tier
              </span>
            </div>
            {daysAgo !== null && (
              <span style={{ fontSize: 12, color: "rgba(232,232,240,0.4)" }}>
                Last order: {daysAgo === 0 ? "today" : `${daysAgo}d ago`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20, alignItems: "start" }}>

        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Identity card */}
          <div style={card}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0", margin: "0 0 16px" }}>Identity</h2>
            <div>
              <InfoRow label="Phone" value={customer.phone ?? "—"} />
              <InfoRow label="Email" value={customer.email ?? "—"} />
              <InfoRow label="City / State" value={[customer.city, customer.state].filter(Boolean).join(", ") || "—"} />
              <InfoRow label="Pincode" value={customer.pincode ?? "—"} />
              <InfoRow label="First seen" value={new Date(customer.firstSeenAt).toLocaleDateString("en-IN")} />
              <InfoRow label="Last order" value={customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString("en-IN") : "—"} />
              {customer.acquisitionSource && (
                <InfoRow
                  label="Source"
                  value={`${customer.acquisitionSource}${customer.acquisitionMedium ? ` / ${customer.acquisitionMedium}` : ""}`}
                />
              )}
            </div>
          </div>

          {/* Scores card */}
          <div style={card}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0", margin: "0 0 16px" }}>Scores</h2>
            <ScoreBar label="RTO Risk" score={customer.rtoRiskScore} />
            <ScoreBar label="Churn Score" score={customer.churnScore} />
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "rgba(232,232,240,0.5)" }}>Lifecycle</span>
              <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: stageStyle.bg, color: stageStyle.color, textTransform: "capitalize" }}>
                {customer.lifecycleStage.replace(/_/g, " ")}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(232,232,240,0.5)" }}>LTV Tier</span>
              <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: ltvStyle.bg, color: ltvStyle.color, textTransform: "capitalize" }}>
                {customer.ltvTier}
              </span>
            </div>
          </div>

          {/* Metrics card */}
          <div style={card}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0", margin: "0 0 16px" }}>Metrics</h2>
            <div>
              <InfoRow label="Total Orders" value={String(customer.totalOrders)} />
              <InfoRow label="Total Spend" value={`₹${customer.totalSpend.toLocaleString("en-IN")}`} />
              <InfoRow label="Avg Order Value" value={`₹${customer.averageOrderValue.toLocaleString("en-IN")}`} />
              <InfoRow label="LTV" value={`₹${customer.ltv.toLocaleString("en-IN")}`} />
              <InfoRow label="Returns" value={`${customer.totalReturns} (${Math.round(customer.returnRate * 100)}%)`} />
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Orders card */}
          <div style={card}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0", margin: "0 0 16px" }}>Orders</h2>
            {orders.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["Order Name", "Amount", "Payment", "Status", "RTO", "Date"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            fontSize: 10,
                            fontWeight: 600,
                            color: "rgba(232,232,240,0.35)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const payStyle = o.paymentMethod === "cod"
                        ? { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" }
                        : { bg: "rgba(34,197,94,0.15)",  color: "#4ade80" }
                      const statusStyle = STATUS_COLORS[o.status] ?? { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" }
                      const rtoStyle = scorePillStyle(o.rtoRisk)

                      return (
                        <tr
                          key={o.id}
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <td style={{ padding: "10px 12px", fontSize: 13, color: "#e8e8f0", fontWeight: 500 }}>
                            {o.shopifyOrderName}
                          </td>
                          <td style={{ padding: "10px 12px", fontSize: 13, color: "#e8e8f0", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            ₹{o.totalPrice.toLocaleString("en-IN")}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: payStyle.bg, color: payStyle.color, textTransform: "uppercase" }}>
                              {o.paymentMethod}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color, textTransform: "capitalize" }}>
                              {o.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: rtoStyle.bg, color: rtoStyle.color }}>
                              {o.rtoRisk}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", fontSize: 12, color: "rgba(232,232,240,0.5)", whiteSpace: "nowrap" }}>
                            {new Date(o.createdAt).toLocaleDateString("en-IN")}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "rgba(232,232,240,0.35)", margin: 0 }}>No orders yet</p>
              </div>
            )}
          </div>

          {/* Timeline card */}
          <div style={card}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0", margin: "0 0 16px" }}>Timeline</h2>
            {timeline.length > 0 ? (
              <div style={{ position: "relative", paddingLeft: 28 }}>
                {/* Vertical line */}
                <div style={{
                  position: "absolute",
                  left: 11,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 1,
                }} />

                {timeline.map((event, i) => (
                  <div
                    key={event.id}
                    style={{
                      position: "relative",
                      paddingBottom: i < timeline.length - 1 ? 20 : 0,
                    }}
                  >
                    {/* Icon dot */}
                    <div style={{
                      position: "absolute",
                      left: -28,
                      top: 2,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "rgba(108,99,255,0.2)",
                      border: "1px solid rgba(108,99,255,0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                    }}>
                      {EVENT_ICON[event.eventType] ?? "•"}
                    </div>

                    {/* Content */}
                    <div>
                      <p style={{ fontSize: 13, color: "#e8e8f0", fontWeight: 500, margin: "0 0 2px" }}>
                        {event.title}
                      </p>
                      <p style={{ fontSize: 11, color: "rgba(232,232,240,0.4)", margin: 0 }}>
                        {new Date(event.occurredAt).toLocaleString("en-IN", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "rgba(232,232,240,0.35)", margin: 0 }}>No events yet</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
