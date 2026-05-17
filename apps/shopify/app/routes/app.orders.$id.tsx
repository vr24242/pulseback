import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import { db } from "@d2c/database"
import { requireShop } from "../lib/shop.server"

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const orderId = params.id ?? ""
  const shop = await requireShop(request)

  const [order, communications] = await Promise.all([
    db.order.findFirst({
      where: { id: orderId, shopId: shop.id },
      select: {
        id: true, shopifyOrderId: true, shopifyOrderName: true,
        totalPrice: true, paymentMethod: true, status: true,
        rtoRisk: true, isRTO: true, pincode: true,
        shippingAddress: true,
        codConfirmationSent: true, codConfirmationConfirmed: true,
        dispatchSlaAt: true, dispatchedAt: true, deliveredAt: true,
        cancelledAt: true, createdAt: true, updatedAt: true,
        items: true,
        customer: { select: { id: true, name: true, phone: true, email: true, lifecycleStage: true, ltvTier: true } },
        shipments: {
          select: { id: true, awb: true, carrier: true, status: true, rawStatus: true, isStuck: true, failedAttempts: true, createdAt: true, deliveredAt: true },
          orderBy: { createdAt: "desc" },
        },
        returnRequests: {
          select: { id: true, status: true, reason: true, refundAmount: true, refundMethod: true, createdAt: true },
          take: 3,
        },
      },
    }),
    db.communication.findMany({
      where: { shopId: shop.id, triggerRef: orderId },
      select: { id: true, templateName: true, triggerType: true, status: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ])

  if (!order) throw new Response("Order not found", { status: 404 })

  return json({ order, communications, shopDomain: shop.domain })
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
  marginBottom: 16,
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.07em",
  color: MUTED,
  textTransform: "uppercase" as const,
  marginBottom: 14,
}

// ─── pill helpers ─────────────────────────────────────────────────────────────
function statusPill(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    placed:     { bg: "rgba(108,99,255,0.18)", color: "#6c63ff" },
    confirmed:  { bg: "rgba(108,99,255,0.18)", color: "#6c63ff" },
    packed:     { bg: "rgba(108,99,255,0.18)", color: "#6c63ff" },
    dispatched: { bg: "rgba(59,130,246,0.18)", color: "#3b82f6" },
    delivered:  { bg: "rgba(16,185,129,0.18)", color: "#10b981" },
    cancelled:  { bg: "rgba(239,68,68,0.18)",  color: "#ef4444" },
    returned:   { bg: "rgba(245,158,11,0.18)", color: "#f59e0b" },
    pending:    { bg: "rgba(245,158,11,0.18)", color: "#f59e0b" },
    approved:   { bg: "rgba(16,185,129,0.18)", color: "#10b981" },
    rejected:   { bg: "rgba(239,68,68,0.18)",  color: "#ef4444" },
    requested:  { bg: "rgba(245,158,11,0.18)", color: "#f59e0b" },
    completed:  { bg: "rgba(16,185,129,0.18)", color: "#10b981" },
  }
  const c = map[status?.toLowerCase()] ?? { bg: CARD_BG, color: MUTED }
  return (
    <span style={{
      background: c.bg, color: c.color,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      padding: "3px 10px", borderRadius: 20,
      textTransform: "uppercase" as const,
      display: "inline-block",
    }}>
      {status?.replace(/_/g, " ")}
    </span>
  )
}

function paymentPill(method: string) {
  const isCod = method?.toLowerCase() === "cod"
  return (
    <span style={{
      background: isCod ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)",
      color:      isCod ? "#f59e0b"               : "#10b981",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      padding: "3px 10px", borderRadius: 20,
      textTransform: "uppercase" as const,
      display: "inline-block",
    }}>
      {method?.toUpperCase()}
    </span>
  )
}

function commStatusPill(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    sent:      { bg: "rgba(16,185,129,0.18)", color: "#10b981" },
    delivered: { bg: "rgba(59,130,246,0.18)", color: "#3b82f6" },
    failed:    { bg: "rgba(239,68,68,0.18)",  color: "#ef4444" },
    pending:   { bg: "rgba(245,158,11,0.18)", color: "#f59e0b" },
    read:      { bg: "rgba(108,99,255,0.18)", color: "#6c63ff" },
  }
  const c = map[status?.toLowerCase()] ?? { bg: CARD_BG, color: MUTED }
  return (
    <span style={{
      background: c.bg, color: c.color,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
      padding: "2px 8px", borderRadius: 20,
      textTransform: "uppercase" as const,
      display: "inline-block",
    }}>
      {status}
    </span>
  )
}

function fmtFull(d: string | Date | null | undefined) {
  if (!d) return null
  return new Date(d as string).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function fmtShort(d: string | Date | null | undefined) {
  if (!d) return null
  return new Date(d as string).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function initials(name: string | null | undefined) {
  if (!name) return "?"
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
}

// ─── component ────────────────────────────────────────────────────────────────
export default function OrderDetailPage() {
  const { order, communications, shopDomain } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  const shippingAddress = order.shippingAddress as Record<string, string> | null
  const lineItems = order.items as unknown as Array<{ title: string; quantity: number; price: number }>
  const isCod = order.paymentMethod?.toLowerCase() === "cod"

  // ── Timeline ──
  type TStep = { label: string; date: string | null | undefined; done: boolean }
  const timeline: TStep[] = [
    { label: "Created",           date: order.createdAt,       done: true },
    ...(isCod
      ? [
          { label: "COD Link Sent",   date: order.codConfirmationSent      ? order.createdAt : null, done: !!order.codConfirmationSent },
          { label: "COD Confirmed",   date: order.codConfirmationConfirmed ? order.createdAt : null, done: !!order.codConfirmationConfirmed },
        ]
      : []),
    { label: "Dispatched",        date: order.dispatchedAt,    done: !!order.dispatchedAt },
    order.cancelledAt
      ? { label: "Cancelled",     date: order.cancelledAt,     done: true }
      : { label: "Delivered",     date: order.deliveredAt,     done: !!order.deliveredAt },
  ]

  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "32px 28px", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Back link ── */}
      <button
        onClick={() => navigate(`/app/orders?shop=${shopDomain}`)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: MUTED, fontSize: 13, padding: 0, marginBottom: 24,
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        &#8592; Orders
      </button>

      {/* ── Hero card ── */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: TEXT, letterSpacing: "-0.02em" }}>
                {order.shopifyOrderName}
              </h1>
              {statusPill(order.status)}
              {paymentPill(order.paymentMethod)}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: MUTED }}>
              Created {fmtShort(order.createdAt)}
            </p>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: TEXT, letterSpacing: "-0.02em" }}>
            &#8377;{Number(order.totalPrice).toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* ── Two-column grid (left ~40%, right ~60%) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 16, alignItems: "start" }}>

        {/* ════ LEFT COLUMN ════ */}
        <div>

          {/* Customer card */}
          <div style={card}>
            <div style={sectionLabel}>Customer</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              {/* Avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 700, color: "#fff", flexShrink: 0,
              }}>
                {initials(order.customer?.name ?? order.customer?.phone)}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
                  {order.customer?.name ?? "Guest"}
                </div>
                {order.customer?.phone && (
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                    {order.customer.phone}
                  </div>
                )}
              </div>
            </div>

            {order.customer?.email && (
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
                {order.customer.email}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 14 }}>
              {order.customer?.lifecycleStage && (
                <span style={{
                  background: "rgba(108,99,255,0.15)", color: "#a78bfa",
                  fontSize: 10, fontWeight: 600, padding: "2px 8px",
                  borderRadius: 20, letterSpacing: "0.04em",
                  textTransform: "uppercase" as const,
                }}>
                  {order.customer.lifecycleStage}
                </span>
              )}
              {order.customer?.ltvTier && (
                <span style={{
                  background: "rgba(16,185,129,0.15)", color: "#10b981",
                  fontSize: 10, fontWeight: 600, padding: "2px 8px",
                  borderRadius: 20, letterSpacing: "0.04em",
                  textTransform: "uppercase" as const,
                }}>
                  {order.customer.ltvTier}
                </span>
              )}
            </div>

            {order.customer?.id && (
              <button
                onClick={() => navigate(`/app/customers/${order.customer!.id}?shop=${shopDomain}`)}
                style={{
                  background: "rgba(108,99,255,0.12)",
                  border: `1px solid rgba(108,99,255,0.25)`,
                  borderRadius: 8, padding: "6px 14px",
                  color: ACCENT, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                &#8594; View customer
              </button>
            )}
          </div>

          {/* Shipping card */}
          <div style={card}>
            <div style={sectionLabel}>Shipping Address</div>
            {shippingAddress ? (
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>
                {shippingAddress.name && <div style={{ fontWeight: 500 }}>{shippingAddress.name}</div>}
                {shippingAddress.address1 && <div style={{ color: MUTED, fontSize: 12 }}>{shippingAddress.address1}</div>}
                {shippingAddress.address2 && <div style={{ color: MUTED, fontSize: 12 }}>{shippingAddress.address2}</div>}
                <div style={{ color: MUTED, fontSize: 12 }}>
                  {[
                    shippingAddress.city,
                    shippingAddress.province ?? shippingAddress.state,
                    shippingAddress.zip ?? shippingAddress.pincode ?? order.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
                {shippingAddress.country && (
                  <div style={{ color: MUTED, fontSize: 12 }}>{shippingAddress.country}</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: MUTED }}>
                {order.pincode ?? "No address on record"}
              </div>
            )}
          </div>

          {/* Timeline card */}
          <div style={card}>
            <div style={sectionLabel}>Timeline</div>
            <div style={{ paddingLeft: 8 }}>
              {timeline.map((step, idx) => (
                <div key={idx} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: idx < timeline.length - 1 ? 0 : 0 }}>
                  {/* Dot + connector */}
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: "50%",
                      background: step.done ? ACCENT : "transparent",
                      border: `2px solid ${step.done ? ACCENT : CARD_BORDER}`,
                      marginTop: 2,
                      flexShrink: 0,
                    }} />
                    {idx < timeline.length - 1 && (
                      <div style={{
                        width: 1, flex: 1, minHeight: 24,
                        background: step.done ? "rgba(108,99,255,0.3)" : CARD_BORDER,
                        margin: "3px 0",
                      }} />
                    )}
                  </div>
                  {/* Label + date */}
                  <div style={{ paddingBottom: idx < timeline.length - 1 ? 16 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: step.done ? 600 : 400, color: step.done ? TEXT : MUTED }}>
                      {step.label}
                    </div>
                    {step.done && step.date && (
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                        {fmtFull(step.date)}
                      </div>
                    )}
                    {!step.done && (
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Pending</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ════ RIGHT COLUMN ════ */}
        <div>

          {/* Line items card */}
          <div style={card}>
            <div style={sectionLabel}>Items</div>
            {lineItems && lineItems.length > 0 ? (
              <div>
                {lineItems.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 0",
                      borderBottom: idx < lineItems.length - 1
                        ? `1px solid rgba(255,255,255,0.04)` : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                        Qty {item.quantity} &times; &#8377;{Number(item.price).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                      &#8377;{(item.quantity * item.price).toLocaleString("en-IN")}
                    </div>
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  paddingTop: 12, marginTop: 4,
                  borderTop: `1px solid ${CARD_BORDER}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Total</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: ACCENT }}>
                    &#8377;{Number(order.totalPrice).toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: MUTED, fontSize: 13 }}>No item data available.</div>
            )}
          </div>

          {/* Shipment card */}
          {order.shipments.length > 0 && (
            <div style={card}>
              <div style={sectionLabel}>Shipment</div>
              {order.shipments.map((s, idx) => (
                <div
                  key={s.id}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid rgba(255,255,255,0.06)`,
                    borderRadius: 10, padding: 14,
                    marginBottom: idx < order.shipments.length - 1 ? 10 : 0,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" as const }}>
                    <div>
                      {s.awb && (
                        <div style={{ fontFamily: "monospace", fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 4 }}>
                          {s.awb}
                        </div>
                      )}
                      {s.carrier && (
                        <div style={{ fontSize: 12, color: MUTED }}>{s.carrier}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                      {s.status && statusPill(s.status)}
                      {s.isStuck && (
                        <span style={{
                          background: "rgba(239,68,68,0.15)", color: "#ef4444",
                          fontSize: 10, fontWeight: 700, padding: "2px 8px",
                          borderRadius: 20, letterSpacing: "0.04em",
                          textTransform: "uppercase" as const,
                        }}>
                          STUCK
                        </span>
                      )}
                    </div>
                  </div>
                  {s.failedAttempts != null && s.failedAttempts > 0 && (
                    <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>
                      {s.failedAttempts} failed delivery attempt{s.failedAttempts > 1 ? "s" : ""}
                    </div>
                  )}
                  {s.rawStatus && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{s.rawStatus}</div>
                  )}
                  {s.deliveredAt && (
                    <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>
                      Delivered {fmtShort(s.deliveredAt)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Returns card */}
          {order.returnRequests.length > 0 && (
            <div style={card}>
              <div style={sectionLabel}>Return Requests</div>
              {order.returnRequests.map((ret, idx) => (
                <div
                  key={ret.id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    padding: "10px 0",
                    borderBottom: idx < order.returnRequests.length - 1
                      ? `1px solid rgba(255,255,255,0.04)` : "none",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {statusPill(ret.status)}
                    {ret.reason && (
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 5 }}>{ret.reason}</div>
                    )}
                  </div>
                  {ret.refundAmount != null && (
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, textAlign: "right" as const, flexShrink: 0 }}>
                      &#8377;{Number(ret.refundAmount).toLocaleString("en-IN")}
                      {ret.refundMethod && (
                        <div style={{ fontSize: 10, color: MUTED, fontWeight: 400, marginTop: 2 }}>
                          via {ret.refundMethod}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Communications card */}
          <div style={card}>
            <div style={sectionLabel}>Communications</div>
            {communications.length === 0 ? (
              <div style={{ color: MUTED, fontSize: 13 }}>No messages sent yet.</div>
            ) : (
              <div>
                {communications.map((comm, idx) => (
                  <div
                    key={comm.id}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "9px 0",
                      borderBottom: idx < communications.length - 1
                        ? `1px solid rgba(255,255,255,0.04)` : "none",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, color: TEXT, fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                      }}>
                        {comm.templateName ?? comm.triggerType ?? "Message"}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                        {fmtFull(comm.sentAt ?? comm.createdAt)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {commStatusPill(comm.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
