import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import { db } from "@d2c/database"
import { requireShop } from "../lib/shop.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await requireShop(request)

  const hasWhatsApp = !!(shop.aiSensyApiKey || shop.watiApiToken || shop.waPhoneNumberId)

  // Stats for the last 30 days
  const since30d = new Date(Date.now() - 30 * 86400000)

  const [
    codSent, codConfirmed,
    abandonedSent,
    dispatchSent,
    orderConfirmSent,
  ] = await Promise.all([
    db.communication.count({ where: { shopId: shop.id, templateName: "cod_confirmation", sentAt: { gte: since30d } } }),
    db.order.count({ where: { shopId: shop.id, codConfirmationConfirmed: true, updatedAt: { gte: since30d } } }),
    db.communication.count({ where: { shopId: shop.id, templateName: "abandoned_cart_recovery", sentAt: { gte: since30d } } }),
    db.communication.count({ where: { shopId: shop.id, templateName: "order_dispatched", sentAt: { gte: since30d } } }),
    db.communication.count({ where: { shopId: shop.id, templateName: "order_confirmed", sentAt: { gte: since30d } } }),
  ])

  return json({
    hasWhatsApp,
    stats: { codSent, codConfirmed, abandonedSent, dispatchSent, orderConfirmSent },
  })
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG_PAGE = "#0f0f13"
const BG_CARD = "rgba(255,255,255,0.04)"
const BORDER_CARD = "rgba(255,255,255,0.08)"
const TEXT_PRIMARY = "#e8e8f0"
const TEXT_MUTED = "rgba(232,232,240,0.5)"
const ACCENT = "#6c63ff"

// ─── Automation definitions ───────────────────────────────────────────────────

interface AutomationDef {
  key: string
  title: string
  description: string
  color: string
  icon: string
  trigger: string
  steps: { label: string; delay?: string }[]
  statsKey: "codSent" | "orderConfirmSent" | "abandonedSent" | "dispatchSent"
  secondaryLabel?: string
  secondaryKey?: "codConfirmed" | null
}

const AUTOMATIONS: AutomationDef[] = [
  {
    key: "cod_confirmation",
    title: "COD Order Confirmation",
    description: "Sent instantly when a COD order is placed. Customer replies YES to confirm or NO to cancel — reducing fake COD orders before dispatch.",
    color: "#f59e0b",
    icon: "💬",
    trigger: "COD order placed",
    steps: [
      { label: "Order placed" },
      { label: "Send message", delay: "Instant" },
      { label: "Await reply" },
    ],
    statsKey: "codSent",
    secondaryLabel: "Confirmed",
    secondaryKey: "codConfirmed",
  },
  {
    key: "order_confirmed",
    title: "Prepaid Order Confirmation",
    description: "Sent instantly when a prepaid order is placed. Reduces WISMO (where is my order?) calls and builds post-purchase trust.",
    color: "#10b981",
    icon: "✅",
    trigger: "Prepaid order placed",
    steps: [
      { label: "Order placed" },
      { label: "Send confirmation", delay: "Instant" },
    ],
    statsKey: "orderConfirmSent",
  },
  {
    key: "abandoned_cart",
    title: "Abandoned Cart Recovery",
    description: "Three-touch recovery sequence when a customer leaves without purchasing. Includes a discount code to recover the sale.",
    color: "#6c63ff",
    icon: "🛒",
    trigger: "Checkout abandoned",
    steps: [
      { label: "Cart abandoned" },
      { label: "Nudge #1", delay: "30 min" },
      { label: "Nudge #2", delay: "4 hr" },
      { label: "Final offer", delay: "24 hr" },
    ],
    statsKey: "abandonedSent",
  },
  {
    key: "order_dispatched",
    title: "Dispatch Notification",
    description: "Sent when your shipping partner marks the order dispatched. Includes AWB number and carrier name to reduce support calls.",
    color: "#3b82f6",
    icon: "🚚",
    trigger: "Fulfillment created",
    steps: [
      { label: "Order dispatched" },
      { label: "Send tracking", delay: "Instant" },
    ],
    statsKey: "dispatchSent",
  },
]

const COMING_SOON = [
  { icon: "💌", label: "Win-back campaigns", desc: "Re-engage lapsed customers" },
  { icon: "⭐", label: "Review requests", desc: "Collect post-delivery feedback" },
  { icon: "📦", label: "Upsell flows", desc: "Cross-sell after first purchase" },
  { icon: "🤝", label: "Referral asks", desc: "Turn customers into advocates" },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function FlowPill({ label, delay }: { label: string; delay?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        padding: "4px 10px",
        borderRadius: 20,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        fontSize: 11,
        color: TEXT_PRIMARY,
        fontWeight: 500,
        whiteSpace: "nowrap" as const,
        lineHeight: 1.4,
        textAlign: "center" as const,
      }}>
        {label}
        {delay && (
          <span style={{ color: TEXT_MUTED, marginLeft: 4 }}>· {delay}</span>
        )}
      </div>
    </div>
  )
}

function FlowArrow() {
  return (
    <div style={{
      color: TEXT_MUTED,
      fontSize: 14,
      lineHeight: 1,
      flexShrink: 0,
    }}>→</div>
  )
}

function AutomationCard({
  auto,
  hasWhatsApp,
  statValue,
  secondaryValue,
}: {
  auto: AutomationDef
  hasWhatsApp: boolean
  statValue: number
  secondaryValue?: number
}) {
  const isActive = hasWhatsApp
  const confirmRate =
    auto.secondaryKey === "codConfirmed" && statValue > 0 && secondaryValue != null
      ? Math.round((secondaryValue / statValue) * 100)
      : null

  return (
    <div style={{
      background: BG_CARD,
      border: `1px solid ${BORDER_CARD}`,
      borderRadius: 16,
      borderLeft: `4px solid ${auto.color}`,
      padding: "24px 28px",
      display: "flex",
      gap: 28,
      alignItems: "flex-start",
      boxShadow: `0 0 20px rgba(108,99,255,0.05)`,
      transition: "box-shadow 0.2s",
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* Left: icon + title + description */}
      <div style={{ flex: "0 0 260px", display: "flex", flexDirection: "column" as const, gap: 12 }}>
        {/* Icon circle */}
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: `${auto.color}22`,
          border: `1px solid ${auto.color}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}>
          {auto.icon}
        </div>

        {/* Title + badges */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: "-0.2px" }}>
              {auto.title}
            </h2>
          </div>

          {/* Status + Always On */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
              background: isActive ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
              color: isActive ? "#10b981" : "#f59e0b",
              border: `1px solid ${isActive ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"}`,
              boxShadow: isActive ? "0 0 8px rgba(16,185,129,0.2)" : "0 0 8px rgba(245,158,11,0.2)",
              letterSpacing: "0.3px",
            }}>
              {isActive ? "● Active" : "⚠ Needs Setup"}
            </span>
            <span style={{
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 500,
              background: "rgba(108,99,255,0.1)",
              color: ACCENT,
              border: "1px solid rgba(108,99,255,0.2)",
              letterSpacing: "0.3px",
            }}>
              Always On
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, lineHeight: 1.6 }}>
            {auto.description}
          </p>
        </div>
      </div>

      {/* Middle: flow visualization */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
        {auto.steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <FlowPill label={step.label} delay={step.delay} />
            {i < auto.steps.length - 1 && <FlowArrow />}
          </div>
        ))}
      </div>

      {/* Right: stats */}
      <div style={{ flex: "0 0 130px", display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 12 }}>
        <div style={{ textAlign: "right" as const }}>
          <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, letterSpacing: "0.4px", textTransform: "uppercase" as const }}>
            Sent (30d)
          </div>
          <div style={{
            fontSize: 32,
            fontWeight: 700,
            background: `linear-gradient(135deg, ${auto.color}, ${ACCENT})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1.1,
          }}>
            {statValue.toLocaleString()}
          </div>
        </div>

        {/* Secondary metric */}
        {auto.secondaryKey === "codConfirmed" && secondaryValue != null && (
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 2, letterSpacing: "0.4px", textTransform: "uppercase" as const }}>
              Confirmed
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY }}>
              {secondaryValue.toLocaleString()}
            </div>
            {confirmRate !== null && (
              <div style={{ fontSize: 11, color: "#10b981", marginTop: 2, fontWeight: 600 }}>
                {confirmRate}% rate
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const { hasWhatsApp, stats } = useLoaderData<typeof loader>()

  return (
    <div style={{
      minHeight: "100vh",
      background: BG_PAGE,
      color: TEXT_PRIMARY,
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "32px 36px 28px",
        position: "relative" as const,
        overflow: "hidden" as const,
      }}>
        {/* Decorative orbs */}
        <div style={{
          position: "absolute" as const, top: -60, right: -60, width: 220, height: 220,
          background: "radial-gradient(circle, rgba(108,99,255,0.3) 0%, transparent 70%)",
          pointerEvents: "none" as const,
        }} />
        <div style={{
          position: "absolute" as const, bottom: -50, left: 400, width: 160, height: 160,
          background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)",
          pointerEvents: "none" as const,
        }} />

        <div style={{ position: "relative" as const, zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "linear-gradient(135deg, #6c63ff, #a855f7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22,
                boxShadow: "0 0 20px rgba(108,99,255,0.4)",
              }}>
                ⚡
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.4px", color: "#fff" }}>
                  Automations
                </h1>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                  Pre-built WhatsApp flows that run on every order — zero configuration needed
                </p>
              </div>
            </div>

            {/* System status */}
            {hasWhatsApp && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px",
                borderRadius: 24,
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.25)",
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 8px #10b981",
                  display: "inline-block",
                  animation: "pulse 2s infinite",
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#10b981", letterSpacing: "0.3px" }}>
                  All systems active
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "28px 36px", maxWidth: 1280 }}>

        {/* WhatsApp not configured banner */}
        {!hasWhatsApp && (
          <div style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap" as const,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>
                  WhatsApp not configured
                </div>
                <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>
                  Add your AiSensy, WATI, or Meta API key in Settings to activate these automations.
                </div>
              </div>
            </div>
            <a
              href="/app/settings"
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "rgba(245,158,11,0.15)",
                border: "1px solid rgba(245,158,11,0.35)",
                color: "#f59e0b",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap" as const,
              }}
            >
              Go to Settings →
            </a>
          </div>
        )}

        {/* Automation cards */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16, marginBottom: 32 }}>
          {AUTOMATIONS.map((auto) => {
            const statValue = stats[auto.statsKey]
            const secondaryValue =
              auto.secondaryKey === "codConfirmed" ? stats.codConfirmed : undefined

            return (
              <AutomationCard
                key={auto.key}
                auto={auto}
                hasWhatsApp={hasWhatsApp}
                statValue={statValue}
                secondaryValue={secondaryValue}
              />
            )
          })}
        </div>

        {/* Coming soon */}
        <div style={{
          background: BG_CARD,
          border: `1px solid ${BORDER_CARD}`,
          borderRadius: 16,
          padding: "28px 32px",
        }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>🔒</span>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: "-0.2px" }}>
                Coming Soon
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>
              More automation flows are in development and will be available automatically.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {COMING_SOON.map((item) => (
              <div key={item.label} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: "16px 18px",
                opacity: 0.6,
                display: "flex",
                flexDirection: "column" as const,
                gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18, filter: "grayscale(0.5)" }}>{item.icon}</span>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>
                    {item.label}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.5 }}>
                  {item.desc}
                </div>
                <div style={{
                  marginTop: 4,
                  padding: "3px 8px",
                  borderRadius: 20,
                  background: "rgba(108,99,255,0.08)",
                  border: "1px solid rgba(108,99,255,0.15)",
                  fontSize: 10,
                  color: "rgba(108,99,255,0.7)",
                  fontWeight: 600,
                  width: "fit-content",
                  letterSpacing: "0.4px",
                }}>
                  COMING SOON
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Pulse animation for the status dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px #10b981; }
          50% { opacity: 0.6; box-shadow: 0 0 16px #10b981; }
        }
      `}</style>
    </div>
  )
}
