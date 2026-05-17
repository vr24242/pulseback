import { useState } from "react"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react"
import { requireShop } from "~/lib/shop.server"
import {
  getSegmentCounts,
  getRecentCampaigns,
  sendBroadcast,
  type SegmentKey,
  type Campaign,
} from "~/services/marketing.server"

// ─── Static constants (client-safe, no DB/BullMQ) ────────────────────────────

const BROADCAST_CAP = 500

interface Segment {
  key: SegmentKey
  label: string
  description: string
  icon: string
}

const SEGMENTS: Segment[] = [
  { key: "champions",        label: "Champions",         icon: "🏆", description: "Top spenders, 5+ orders, active. Best for upsell & referral." },
  { key: "at_risk",          label: "At Risk",           icon: "⚠️", description: "Buying less, churn score rising. Act now before they lapse." },
  { key: "lapsed_highvalue", label: "Lapsed High Value", icon: "💎", description: "High/VIP LTV but haven't ordered in 31-90 days. Offer a comeback deal." },
  { key: "new_second_push",  label: "New → 2nd Order",   icon: "🌱", description: "Placed exactly 1 order. Convert to repeat buyer — highest lifetime impact." },
  { key: "cod_habitual",     label: "COD → Prepaid",     icon: "💳", description: "Always pay COD. Incentivize prepaid to reduce your float & RTO risk." },
  { key: "churned",          label: "Churned",           icon: "👋", description: "No order in 180+ days. Long shot, but even 5% recovery is pure upside." },
  { key: "all_active",       label: "All Active",        icon: "📣", description: "Every customer active in last 30 days. Use sparingly." },
]

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await requireShop(request)
  const [segmentCounts, campaigns] = await Promise.all([
    getSegmentCounts(shop.id),
    getRecentCampaigns(shop.id),
  ])
  return json({ segmentCounts, campaigns, shopDomain: shop.domain })
}

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const shop = await requireShop(request)
  const form = await request.formData()
  const segment = form.get("segment") as SegmentKey
  const message = (form.get("message") as string ?? "").trim()

  if (!segment || !message || message.length < 10) {
    return json({ ok: false, error: "Message must be at least 10 characters." })
  }
  if (message.length > 1000) {
    return json({ ok: false, error: "Message too long (max 1000 characters)." })
  }

  const { queued, campaignId } = await sendBroadcast(shop.id, segment, message)
  return json({ ok: true, queued, campaignId })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarketingDashboard() {
  const { segmentCounts, campaigns, shopDomain } = useLoaderData<typeof loader>()
  const submit = useSubmit()
  const nav = useNavigation()
  const isSending = nav.state === "submitting"

  const [selectedSegment, setSelectedSegment] = useState<SegmentKey | null>(null)
  const [message, setMessage] = useState("")
  const [lastResult, setLastResult] = useState<{ queued: number; campaignId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const counts = segmentCounts as Record<SegmentKey, number>
  const recentCampaigns = campaigns as Campaign[]

  const selected = SEGMENTS.find(s => s.key === selectedSegment)
  const recipientCount = selectedSegment ? (counts[selectedSegment] ?? 0) : 0
  const cappedCount = Math.min(recipientCount, BROADCAST_CAP)
  const canSend = selected && message.trim().length >= 10 && recipientCount > 0

  function handleSend() {
    if (!canSend) return
    setError(null)
    setLastResult(null)
    const form = new FormData()
    form.append("segment", selectedSegment!)
    form.append("message", message)
    submit(form, { method: "post" })
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #1e1b3a 50%, #1a1340 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "32px 36px 28px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -50, right: -30, width: 200, height: 200, background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #a855f7, #6c63ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: "0 4px 12px rgba(168,85,247,0.4)" }}>📣</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>Marketing OS</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Audience segments · WhatsApp broadcast · Campaign history</p>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 36px", maxWidth: 1280 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 24 }}>

          {/* LEFT — Segment picker + composer */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Segment grid */}
            <div style={cardStyle}>
              <SectionHeader icon="🎯" title="Pick your audience" sub="Select a segment to broadcast to" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {SEGMENTS.map(seg => {
                  const count = counts[seg.key] ?? 0
                  const active = selectedSegment === seg.key
                  return (
                    <button
                      key={seg.key}
                      onClick={() => { setSelectedSegment(seg.key); setLastResult(null); setError(null) }}
                      style={{
                        background: active ? "rgba(108,99,255,0.15)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(108,99,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 12, padding: "14px 16px",
                        cursor: "pointer", textAlign: "left",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{seg.icon}</span>
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          color: count > 0 ? (active ? "#6c63ff" : "#e2e8f0") : "#334155",
                        }}>
                          {count.toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? "#c4bbff" : "#94a3b8", marginBottom: 4 }}>
                        {seg.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.4 }}>
                        {seg.description}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Message composer */}
            <div style={cardStyle}>
              <SectionHeader icon="✍️" title="Write your message" sub="Plain WhatsApp text · max 1000 chars" />

              {!selectedSegment ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: "#334155", fontSize: 13 }}>
                  ← Select a segment first
                </div>
              ) : (
                <>
                  {/* Selected segment summary */}
                  <div style={{ background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>
                      {selected?.icon} {selected?.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: recipientCount > 0 ? "#6c63ff" : "#ef4444" }}>
                      {cappedCount} recipient{cappedCount !== 1 ? "s" : ""}
                      {recipientCount > BROADCAST_CAP ? ` (capped from ${recipientCount})` : ""}
                    </span>
                  </div>

                  {/* Textarea */}
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder={`Hi {name}! We wanted to reach out...

Tip: Keep it short, conversational, and include a clear next step.`}
                    maxLength={1000}
                    rows={7}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 10, padding: "14px 16px",
                      color: "#e2e8f0", fontSize: 14, lineHeight: 1.6,
                      resize: "vertical", fontFamily: "inherit",
                      outline: "none",
                    }}
                    onFocus={e => (e.target.style.borderColor = "rgba(108,99,255,0.5)")}
                    onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: message.length > 900 ? "#ef4444" : "#475569" }}>
                      {message.length}/1000
                    </div>
                    <div style={{ fontSize: 11, color: "#334155" }}>
                      Sends via WhatsApp · quiet hours respected
                    </div>
                  </div>

                  {error && (
                    <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 13, color: "#ef4444" }}>
                      {error}
                    </div>
                  )}

                  {lastResult && (
                    <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, fontSize: 13, color: "#10b981" }}>
                      ✅ Broadcast queued for <strong>{lastResult.queued}</strong> customers. Messages will send respecting quiet hours.
                    </div>
                  )}

                  <button
                    onClick={handleSend}
                    disabled={!canSend || isSending}
                    style={{
                      marginTop: 16, width: "100%",
                      background: canSend && !isSending
                        ? "linear-gradient(135deg, #6c63ff, #a855f7)"
                        : "rgba(255,255,255,0.06)",
                      color: canSend && !isSending ? "#fff" : "#475569",
                      border: "none", borderRadius: 10, padding: "14px",
                      fontSize: 14, fontWeight: 700, cursor: canSend && !isSending ? "pointer" : "not-allowed",
                      transition: "all 0.15s",
                      boxShadow: canSend && !isSending ? "0 4px 16px rgba(108,99,255,0.3)" : "none",
                    }}
                  >
                    {isSending
                      ? "⏳ Queuing broadcast..."
                      : canSend
                      ? `📣 Send to ${cappedCount} customers`
                      : "Select segment + write message"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — Reminders + campaign history */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Best practices */}
            <div style={cardStyle}>
              <SectionHeader icon="💡" title="Broadcast tips" />
              {[
                { icon: "🕐", tip: "Messages respect 8am–10pm quiet hours automatically." },
                { icon: "🎯", tip: "Smaller, targeted segments outperform blasts 3-5×." },
                { icon: "⚡", tip: "Champions & At Risk segments convert best." },
                { icon: "🔁", tip: "Don't broadcast the same segment more than once a week." },
                { icon: "📈", tip: "Pair with a discount or urgency hook for lapsed customers." },
              ].map(({ icon, tip }) => (
                <div key={tip} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
            </div>

            {/* Campaign history */}
            <div style={cardStyle}>
              <SectionHeader icon="📋" title="Recent broadcasts" />
              {recentCampaigns.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#334155", fontSize: 13 }}>
                  No broadcasts sent yet
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recentCampaigns.map(c => {
                    const d = new Date(c.sentAt)
                    return (
                      <div key={c.campaignId} style={{
                        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 10, padding: "12px 14px",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}>
                            Broadcast
                          </div>
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
                            {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#6c63ff" }}>
                          {c.count} sent
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Segment health summary */}
            <div style={cardStyle}>
              <SectionHeader icon="🩺" title="Audience health" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { key: "champions" as SegmentKey, color: "#eab308" },
                  { key: "at_risk" as SegmentKey, color: "#f97316" },
                  { key: "lapsed_highvalue" as SegmentKey, color: "#a855f7" },
                  { key: "churned" as SegmentKey, color: "#ef4444" },
                ].map(({ key, color }) => {
                  const seg = SEGMENTS.find(s => s.key === key)!
                  const count = counts[key] ?? 0
                  const maxCount = Math.max(...["champions","at_risk","lapsed_highvalue","churned"].map(k => counts[k as SegmentKey] ?? 0), 1)
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>{seg.icon} {seg.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 99 }}>
                        <div style={{ height: "100%", width: `${(count / maxCount) * 100}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 99, transition: "width 0.6s" }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>{title}</span>
      </div>
      {sub && <div style={{ fontSize: 12, color: "#475569", marginTop: 3, paddingLeft: 26 }}>{sub}</div>}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: "22px 24px",
}
