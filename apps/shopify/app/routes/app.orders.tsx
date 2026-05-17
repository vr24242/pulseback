import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import { db } from "@d2c/database"
import { requireShop } from "../lib/shop.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const statusFilter = url.searchParams.get("status") ?? undefined

  const shop = await requireShop(request)
  const shopDomain = shop.domain

  const [orders, stats] = await Promise.all([
    db.order.findMany({
      where: {
        shopId: shop.id,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        shopifyOrderName: true,
        totalPrice: true,
        paymentMethod: true,
        status: true,
        rtoRisk: true,
        isRTO: true,
        codConfirmationSent: true,
        codConfirmationConfirmed: true,
        dispatchSlaAt: true,
        dispatchedAt: true,
        createdAt: true,
        customer: { select: { id: true, name: true, phone: true } },
        shipments: { select: { awb: true, carrier: true, status: true }, take: 1 },
      },
    }),
    db.order.groupBy({
      by: ["status"],
      where: { shopId: shop.id },
      _count: { id: true },
    }),
  ])

  const countByStatus = Object.fromEntries(stats.map((s) => [s.status, s._count.id]))

  return json({ orders, countByStatus, shopDomain })
}

// ─── design tokens ────────────────────────────────────────────────────────────
const BG = "#0f0f13"
const CARD_BG = "rgba(255,255,255,0.04)"
const CARD_BORDER = "rgba(255,255,255,0.08)"
const ACCENT = "#6c63ff"
const TEXT = "#e8e8f0"
const MUTED = "rgba(232,232,240,0.5)"

const card: React.CSSProperties = {
  background: CARD_BG,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 16,
  padding: 24,
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function statusPill(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    placed:     { bg: "rgba(108,99,255,0.18)",  color: "#6c63ff" },
    confirmed:  { bg: "rgba(108,99,255,0.18)",  color: "#6c63ff" },
    packed:     { bg: "rgba(108,99,255,0.18)",  color: "#6c63ff" },
    dispatched: { bg: "rgba(59,130,246,0.18)",  color: "#3b82f6" },
    delivered:  { bg: "rgba(16,185,129,0.18)",  color: "#10b981" },
    cancelled:  { bg: "rgba(239,68,68,0.18)",   color: "#ef4444" },
    returned:   { bg: "rgba(245,158,11,0.18)",  color: "#f59e0b" },
  }
  const c = map[status] ?? { bg: CARD_BG, color: MUTED }
  return (
    <span style={{
      background: c.bg, color: c.color,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      padding: "3px 10px", borderRadius: 20,
      textTransform: "uppercase" as const,
      display: "inline-block",
    }}>
      {status.replace(/_/g, " ")}
    </span>
  )
}

function paymentPill(method: string) {
  const isCod = method.toLowerCase() === "cod"
  return (
    <span style={{
      background: isCod ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)",
      color:      isCod ? "#f59e0b"               : "#10b981",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      padding: "3px 10px", borderRadius: 20,
      textTransform: "uppercase" as const,
      display: "inline-block",
    }}>
      {method.toUpperCase()}
    </span>
  )
}

function rtoPill(risk: number) {
  const { bg, color } =
    risk > 60 ? { bg: "rgba(239,68,68,0.18)",  color: "#ef4444" } :
    risk > 40 ? { bg: "rgba(245,158,11,0.18)", color: "#f59e0b" } :
                { bg: "rgba(16,185,129,0.18)", color: "#10b981" }
  return (
    <span style={{
      background: bg, color,
      fontSize: 11, fontWeight: 600,
      padding: "3px 10px", borderRadius: 20,
      display: "inline-block",
    }}>
      {risk}%
    </span>
  )
}

// ─── tabs & chips ─────────────────────────────────────────────────────────────
const TABS = [
  { label: "All",        key: "" },
  { label: "Placed",     key: "placed" },
  { label: "Dispatched", key: "dispatched" },
  { label: "Delivered",  key: "delivered" },
  { label: "Cancelled",  key: "cancelled" },
]

const STAT_CHIPS = [
  { label: "Placed",     key: "placed",     color: "#6c63ff" },
  { label: "Dispatched", key: "dispatched", color: "#3b82f6" },
  { label: "Delivered",  key: "delivered",  color: "#10b981" },
  { label: "Cancelled",  key: "cancelled",  color: "#ef4444" },
]

// ─── component ────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const { orders, countByStatus, shopDomain } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  const activeStatus =
    typeof window !== "undefined"
      ? new URL(window.location.href).searchParams.get("status") ?? ""
      : ""

  const slaBreached = orders.filter(
    (o) => o.dispatchSlaAt && !o.dispatchedAt && new Date(o.dispatchSlaAt) < new Date()
  )

  const total = Object.values(countByStatus).reduce((a, b) => a + b, 0)

  const TH: React.CSSProperties = {
    padding: "10px 14px",
    textAlign: "left" as const,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.07em",
    color: MUTED,
    textTransform: "uppercase" as const,
    borderBottom: `1px solid ${CARD_BORDER}`,
    whiteSpace: "nowrap" as const,
  }

  const TD: React.CSSProperties = {
    padding: "13px 14px",
    fontSize: 13,
    color: TEXT,
    borderBottom: `1px solid rgba(255,255,255,0.04)`,
    verticalAlign: "middle" as const,
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "32px 28px", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: "-0.02em" }}>
          Orders
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>
          {total.toLocaleString()} total
        </p>
      </div>

      {/* ── Status tab strip ── */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 24,
        borderBottom: `1px solid ${CARD_BORDER}`, paddingBottom: 0,
      }}>
        {TABS.map(({ label, key }) => {
          const isActive = activeStatus === key
          return (
            <button
              key={key}
              onClick={() =>
                navigate(
                  key
                    ? `/app/orders?shop=${shopDomain}&status=${key}`
                    : `/app/orders?shop=${shopDomain}`
                )
              }
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? `2px solid ${ACCENT}` : "2px solid transparent",
                marginBottom: -1,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? TEXT : MUTED,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ── SLA breach banner ── */}
      {slaBreached.length > 0 && (
        <div style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 12,
          padding: "12px 18px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>&#9888;</span>
          <span style={{ fontSize: 13, color: "#f87171", fontWeight: 500 }}>
            <strong>{slaBreached.length} order{slaBreached.length > 1 ? "s" : ""}</strong>{" "}
            breached dispatch SLA and haven&apos;t shipped yet.
          </span>
        </div>
      )}

      {/* ── Stat chips ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, marginBottom: 24 }}>
        {STAT_CHIPS.map(({ label, key, color }) => (
          <div
            key={key}
            onClick={() => navigate(`/app/orders?shop=${shopDomain}&status=${key}`)}
            style={{
              ...card,
              padding: "14px 22px",
              minWidth: 110,
              textAlign: "center" as const,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(108,99,255,0.35)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = CARD_BORDER)}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color }}>
              {(countByStatus[key] ?? 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2, letterSpacing: "0.03em" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Orders table ── */}
      <div style={card}>
        {orders.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "60px 0", color: MUTED, fontSize: 14 }}>
            No orders found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Order", "Customer", "Amount", "Payment", "Status", "AWB", "RTO Risk", "Date"].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const shipment = o.shipments[0]
                  const slaBreach =
                    o.dispatchSlaAt && !o.dispatchedAt && new Date(o.dispatchSlaAt) < new Date()
                  return (
                    <tr
                      key={o.id}
                      style={{ transition: "background 0.12s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(108,99,255,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Order */}
                      <td style={TD}>
                        <span
                          onClick={() => navigate(`/app/orders/${o.id}?shop=${shopDomain}`)}
                          style={{ color: ACCENT, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                        >
                          {o.shopifyOrderName}
                        </span>
                      </td>

                      {/* Customer */}
                      <td style={TD}>
                        <span
                          onClick={() =>
                            navigate(`/app/customers/${o.customer?.id}?shop=${shopDomain}`)
                          }
                          style={{
                            color: TEXT,
                            cursor: "pointer",
                            textDecoration: "underline",
                            textDecorationColor: MUTED,
                          }}
                        >
                          {o.customer?.name ?? o.customer?.phone ?? "Guest"}
                        </span>
                      </td>

                      {/* Amount */}
                      <td style={{ ...TD, fontWeight: 600 }}>
                        &#8377;{Number(o.totalPrice).toLocaleString("en-IN")}
                      </td>

                      {/* Payment */}
                      <td style={TD}>{paymentPill(o.paymentMethod)}</td>

                      {/* Status */}
                      <td style={TD}>{statusPill(o.status)}</td>

                      {/* AWB */}
                      <td style={TD}>
                        {slaBreach ? (
                          <span style={{ color: "#ef4444", fontWeight: 600, fontSize: 12 }}>
                            SLA &#9888;
                          </span>
                        ) : shipment?.awb ? (
                          <span style={{ fontFamily: "monospace", fontSize: 12, color: MUTED }}>
                            {shipment.awb}
                          </span>
                        ) : (
                          <span style={{ color: MUTED }}>&#8212;</span>
                        )}
                      </td>

                      {/* RTO Risk */}
                      <td style={TD}>{rtoPill(o.rtoRisk)}</td>

                      {/* Date */}
                      <td style={{ ...TD, color: MUTED, fontSize: 12 }}>
                        {new Date(o.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
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
  )
}
