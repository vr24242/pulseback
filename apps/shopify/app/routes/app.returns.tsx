import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate, useSubmit, useNavigation } from "@remix-run/react"
import { requireShop } from "~/lib/shop.server"
import {
  getReturnsStats,
  getReturnRequests,
  approveReturnRequest,
  rejectReturnRequest,
  schedulePickup,
  type ReturnFilter,
  type ReturnRequest,
  type ReturnsStats,
} from "~/services/returns.server"

const RETURNS_PAGE_SIZE = 20
import { queueCommunication } from "@d2c/core/queue"

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const shop = await requireShop(request)
  const form = await request.formData()

  const intent = form.get("action") as string
  const returnRequestId = form.get("returnRequestId") as string
  const rejectionReason = (form.get("rejectionReason") as string | null) ?? ""

  if (!returnRequestId) {
    return json({ error: "Missing returnRequestId" }, { status: 400 })
  }

  try {
    if (intent === "approve") {
      const updated = await approveReturnRequest(returnRequestId)
      // Queue WhatsApp notification
      if (updated.customerId && updated.customer?.phone) {
        await queueCommunication({
          shopId: shop.id,
          customerId: updated.customerId,
          phone: updated.customer.phone,
          channel: "whatsapp",
          body: `Your return request for ${updated.order.shopifyOrderName} has been approved! We'll schedule a pickup shortly.`,
          triggerType: "return_approved",
          triggerRef: returnRequestId,
          priority: "high",
        })
      }
      return json({ ok: true, action: "approve" })
    }

    if (intent === "reject") {
      if (!rejectionReason) {
        return json({ error: "Rejection reason is required" }, { status: 400 })
      }
      const updated = await rejectReturnRequest(returnRequestId, rejectionReason)
      // Queue WhatsApp notification
      if (updated.customerId && updated.customer?.phone) {
        await queueCommunication({
          shopId: shop.id,
          customerId: updated.customerId,
          phone: updated.customer.phone,
          channel: "whatsapp",
          body: `Your return request for ${updated.order.shopifyOrderName} was not approved. Reason: ${rejectionReason}`,
          triggerType: "return_rejected",
          triggerRef: returnRequestId,
          priority: "high",
        })
      }
      return json({ ok: true, action: "reject" })
    }

    if (intent === "schedule_pickup") {
      await schedulePickup(returnRequestId, shop.id)
      return json({ ok: true, action: "schedule_pickup" })
    }

    return json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("[returns action]", err)
    return json({ error: "Action failed" }, { status: 500 })
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await requireShop(request)
  const url = new URL(request.url)
  const filter = (url.searchParams.get("filter") ?? "all") as ReturnFilter
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10))
  const shopDomain = shop.domain

  const [stats, { requests, total }] = await Promise.all([
    getReturnsStats(shop.id),
    getReturnRequests(shop.id, filter, page),
  ])

  return json({ stats, requests, total, filter, page, shopDomain })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (h < 1) return "Just now"
  if (h < 24) return `${h}h ago`
  if (d === 1) return "Yesterday"
  return `${d}d ago`
}

function itemsSummary(items: ReturnRequest["items"]): string {
  if (!items || items.length === 0) return "—"
  return items
    .map(i => `${i.title} ×${i.quantity}`)
    .join(", ")
    .slice(0, 60) + (items.length > 2 ? "…" : "")
}

const REASON_LABEL: Record<string, string> = {
  quality:     "Quality Issue",
  wrong_item:  "Wrong Item",
  not_needed:  "Not Needed",
  damaged:     "Damaged",
  size:        "Wrong Size",
  other:       "Other",
}

const REFUND_METHOD_LABEL: Record<string, string> = {
  original_payment: "Original",
  store_credit:     "Store Credit",
  bank_transfer:    "Bank Transfer",
}

const STATUS_PILL: Record<string, { label: string; bg: string; color: string }> = {
  pending:          { label: "Pending",          bg: "rgba(234,179,8,0.15)",   color: "#ca8a04" },
  approved:         { label: "Approved",         bg: "rgba(59,130,246,0.15)",  color: "#3b82f6" },
  rejected:         { label: "Rejected",         bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  pickup_scheduled: { label: "Pickup Scheduled", bg: "rgba(108,99,255,0.15)",  color: "#6c63ff" },
  picked_up:        { label: "Picked Up",        bg: "rgba(99,102,241,0.15)",  color: "#818cf8" },
  processed:        { label: "Processing",       bg: "rgba(20,184,166,0.15)",  color: "#14b8a6" },
  refunded:         { label: "Refunded",         bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReturnsDashboard() {
  const { stats, requests, total, filter, page, shopDomain } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const submit = useSubmit()
  const navigation = useNavigation()

  const isSubmitting = navigation.state === "submitting"

  const returnsStats = stats as ReturnsStats
  const returnRequests = requests as ReturnRequest[]
  const totalPages = Math.ceil(total / RETURNS_PAGE_SIZE)

  function go(f: string, p = 1) {
    navigate(`/app/returns?shop=${shopDomain}&filter=${f}&page=${p}`)
  }

  function handleAction(
    intent: "approve" | "reject" | "schedule_pickup",
    returnRequestId: string,
    extra?: { rejectionReason?: string },
  ) {
    const data: Record<string, string> = { action: intent, returnRequestId }
    if (extra?.rejectionReason) data.rejectionReason = extra.rejectionReason
    submit(data, { method: "post" })
  }

  const FILTER_TABS: { key: ReturnFilter; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "pending",  label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "refunded", label: "Refunded" },
  ]

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
          background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #6c63ff, #a855f7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>↩️</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px", color: "#fff" }}>
                Returns Center
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                Return requests · Refunds · Pickup scheduling
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 36px", maxWidth: 1400 }}>

        {/* ── Stat cards ───────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          <StatCard
            icon="↩️"
            label="Return Requests"
            value={returnsStats.totalRequests}
            subtitle="Last 30 days"
            gradient="linear-gradient(135deg, rgba(108,99,255,0.15), rgba(108,99,255,0.05))"
            accent="#6c63ff"
          />
          <StatCard
            icon="⏳"
            label="Pending Review"
            value={returnsStats.pendingCount}
            subtitle="Awaiting your action"
            gradient="linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.05))"
            accent="#ca8a04"
          />
          <StatCard
            icon="💸"
            label="Refunds Issued"
            value={formatINR(returnsStats.refundAmountIssued)}
            subtitle="Last 30 days"
            gradient="linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))"
            accent="#10b981"
          />
          <StatCard
            icon="📊"
            label="Return Rate"
            value={`${returnsStats.returnRate}%`}
            subtitle="Returns / total orders (30d)"
            gradient="linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))"
            accent="#ef4444"
          />
        </div>

        {/* ── Returns table ─────────────────────────────────────────────────────── */}
        <div style={cardStyle}>
          {/* Filter tabs */}
          <div style={{
            display: "flex", alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            padding: "0 24px",
            gap: 4,
          }}>
            {FILTER_TABS.map(tab => (
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
                {tab.key === "pending" && returnsStats.pendingCount > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, minWidth: 20, height: 20,
                    background: filter === "pending" ? "rgba(108,99,255,0.2)" : "rgba(255,255,255,0.07)",
                    color: filter === "pending" ? "#6c63ff" : "#64748b",
                    borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "0 6px",
                  }}>
                    {returnsStats.pendingCount}
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
          {returnRequests.length === 0 ? (
            <div style={{ padding: 64, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0" }}>
                {filter === "pending" ? "No pending returns" : "No returns found"}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
                {filter === "pending"
                  ? "All return requests have been reviewed."
                  : "No return requests match this filter."}
              </div>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Customer", "Order", "Items", "Reason", "Refund", "Status", "Requested", "Actions"].map(h => (
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
                    {returnRequests.map((r, i) => (
                      <ReturnRow
                        key={r.id}
                        r={r}
                        i={i}
                        isSubmitting={isSubmitting}
                        onApprove={() => handleAction("approve", r.id)}
                        onReject={(reason) => handleAction("reject", r.id, { rejectionReason: reason })}
                        onSchedulePickup={() => handleAction("schedule_pickup", r.id)}
                      />
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
                    Showing {(page - 1) * RETURNS_PAGE_SIZE + 1}–{Math.min(page * RETURNS_PAGE_SIZE, total)} of {total}
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
          {Object.entries(STATUS_PILL).map(([key, { color, label }]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Return row ───────────────────────────────────────────────────────────────

function ReturnRow({
  r, i, isSubmitting, onApprove, onReject, onSchedulePickup,
}: {
  r: ReturnRequest
  i: number
  isSubmitting: boolean
  onApprove: () => void
  onReject: (reason: string) => void
  onSchedulePickup: () => void
}) {
  const statusPill = STATUS_PILL[r.status] ?? { label: r.status, bg: "rgba(107,114,128,0.12)", color: "#6b7280" }

  function handleReject() {
    const reason = window.prompt("Enter rejection reason:")
    if (reason && reason.trim()) {
      onReject(reason.trim())
    }
  }

  return (
    <tr
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.06)")}
      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)")}
    >
      {/* Customer */}
      <td style={tdStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
          {r.customer?.name ?? "—"}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
          {r.customer?.phone ?? "—"}
        </div>
      </td>

      {/* Order */}
      <td style={tdStyle}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#f1f5f9" }}>
          {r.order.shopifyOrderName}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
          {formatINR(r.order.totalPrice)} · <span style={{
            color: r.order.paymentMethod === "cod" ? "#f97316" : "#10b981",
            fontWeight: 500,
          }}>{r.order.paymentMethod.toUpperCase()}</span>
        </div>
      </td>

      {/* Items */}
      <td style={{ ...tdStyle, maxWidth: 180 }}>
        <div style={{
          fontSize: 12, color: "#94a3b8",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={itemsSummary(r.items)}>
          {itemsSummary(r.items)}
        </div>
      </td>

      {/* Reason */}
      <td style={tdStyle}>
        <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 500 }}>
          {REASON_LABEL[r.reason] ?? r.reason}
        </div>
        {r.reasonNote && (
          <div style={{
            fontSize: 11, color: "#475569", marginTop: 3, maxWidth: 140,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={r.reasonNote}>
            {r.reasonNote}
          </div>
        )}
      </td>

      {/* Refund */}
      <td style={tdStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
          {formatINR(r.refundAmount)}
        </div>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
          {REFUND_METHOD_LABEL[r.refundMethod] ?? r.refundMethod}
        </div>
      </td>

      {/* Status */}
      <td style={tdStyle}>
        <span style={{
          display: "inline-block",
          padding: "3px 10px", borderRadius: 99,
          background: statusPill.bg, color: statusPill.color,
          fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
        }}>
          {statusPill.label}
        </span>
        {r.rejectionReason && (
          <div style={{ fontSize: 10, color: "#ef4444", marginTop: 3, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={r.rejectionReason}>
            {r.rejectionReason}
          </div>
        )}
      </td>

      {/* Requested date */}
      <td style={tdStyle}>
        <div style={{ fontSize: 12, color: "#64748b" }}>{timeAgo(r.createdAt)}</div>
        <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>
          {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
        </div>
      </td>

      {/* Actions */}
      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
        {r.status === "pending" && (
          <div style={{ display: "flex", gap: 6 }}>
            <ActionButton
              label="✓ Approve"
              bg="rgba(16,185,129,0.12)"
              color="#10b981"
              border="rgba(16,185,129,0.3)"
              disabled={isSubmitting}
              onClick={onApprove}
            />
            <ActionButton
              label="✗ Reject"
              bg="rgba(239,68,68,0.12)"
              color="#ef4444"
              border="rgba(239,68,68,0.3)"
              disabled={isSubmitting}
              onClick={handleReject}
            />
          </div>
        )}
        {r.status === "approved" && (
          <ActionButton
            label="📦 Schedule Pickup"
            bg="rgba(108,99,255,0.12)"
            color="#6c63ff"
            border="rgba(108,99,255,0.3)"
            disabled={isSubmitting}
            onClick={onSchedulePickup}
          />
        )}
        {!["pending", "approved"].includes(r.status) && (
          <span style={{ fontSize: 12, color: "#334155" }}>—</span>
        )}
      </td>
    </tr>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionButton({
  label, bg, color, border, disabled, onClick,
}: {
  label: string
  bg: string
  color: string
  border: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  )
}

function StatCard({
  icon, label, value, subtitle, gradient, accent,
}: {
  icon: string; label: string; value: string | number
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
      <div style={{
        position: "absolute", bottom: -20, right: -20, width: 80, height: 80,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
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

// ─── Shared styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  overflow: "hidden",
}

const tdStyle: React.CSSProperties = {
  padding: "14px 20px",
  verticalAlign: "middle",
}
