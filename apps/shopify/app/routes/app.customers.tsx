import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import { useState } from "react"
import { db } from "@d2c/database"
import { requireShop } from "../lib/shop.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const stage = url.searchParams.get("stage") ?? undefined

  const shop = await requireShop(request)
  const shopDomain = shop.domain

  const customers = await db.customer.findMany({
    where: {
      shopId: shop.id,
      ...(stage ? { lifecycleStage: stage } : {}),
    },
    orderBy: { ltv: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      ltv: true,
      totalOrders: true,
      lifecycleStage: true,
      ltvTier: true,
      churnScore: true,
      rtoRiskScore: true,
      lastOrderAt: true,
    },
  })

  return json({ customers, shopDomain })
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

function scorePill(score: number) {
  if (score < 40) return { bg: "rgba(34,197,94,0.15)",  color: "#4ade80" }
  if (score < 60) return { bg: "rgba(251,146,60,0.15)", color: "#fb923c" }
  return                 { bg: "rgba(239,68,68,0.15)",  color: "#f87171" }
}

const FILTER_TABS = [
  { label: "All",      stage: "" },
  { label: "Champions", stage: "champion" },
  { label: "At-Risk",  stage: "at_risk" },
  { label: "Lapsed",   stage: "lapsed" },
  { label: "Churned",  stage: "churned" },
]

export default function CustomersPage() {
  const { customers, shopDomain } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const filtered = customers.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c.name?.toLowerCase().includes(q)) ||
      (c.phone?.toLowerCase().includes(q)) ||
      (c.email?.toLowerCase().includes(q))
    )
  })

  const url = typeof window !== "undefined" ? new URL(window.location.href) : null
  const activeStage = url?.searchParams.get("stage") ?? ""

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13", padding: "32px 24px", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#e8e8f0", margin: 0, lineHeight: 1.2 }}>
          Customers
        </h1>
        <p style={{ fontSize: 14, color: "rgba(232,232,240,0.5)", margin: "6px 0 0" }}>
          {customers.length} customers
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "10px 16px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            color: "#e8e8f0",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {FILTER_TABS.map((tab) => {
          const isActive = activeStage === tab.stage
          return (
            <button
              key={tab.stage}
              onClick={() => {
                const params = new URLSearchParams(window.location.search)
                if (tab.stage) {
                  params.set("stage", tab.stage)
                } else {
                  params.delete("stage")
                }
                navigate(`/app/customers?${params.toString()}`)
              }}
              style={{
                padding: "7px 18px",
                borderRadius: 20,
                border: isActive ? "1px solid #6c63ff" : "1px solid rgba(255,255,255,0.1)",
                background: isActive ? "rgba(108,99,255,0.18)" : "rgba(255,255,255,0.04)",
                color: isActive ? "#a89dff" : "rgba(232,232,240,0.6)",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Table card */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {filtered.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Customer", "Stage", "LTV Tier", "Orders", "Spend", "Churn", "RTO Risk", "Last Order"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 20px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "rgba(232,232,240,0.4)",
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
                {filtered.map((c) => {
                  const stageStyle = STAGE_COLORS[c.lifecycleStage] ?? { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" }
                  const ltvStyle = LTV_COLORS[c.ltvTier] ?? { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" }
                  const churnStyle = scorePill(c.churnScore)
                  const rtoStyle = scorePill(c.rtoRiskScore)
                  const isHovered = hoveredRow === c.id
                  const displayName = c.name ?? c.phone ?? c.email ?? "—"
                  const sub = c.name ? (c.phone ?? c.email) : null

                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/app/customers/${c.id}?shop=${shopDomain}`)}
                      onMouseEnter={() => setHoveredRow(c.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                        background: isHovered ? "rgba(108,99,255,0.05)" : "transparent",
                        cursor: "pointer",
                        transition: "background 0.12s ease",
                      }}
                    >
                      {/* Customer */}
                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0" }}>{displayName}</div>
                        {sub && <div style={{ fontSize: 12, color: "rgba(232,232,240,0.4)", marginTop: 2 }}>{sub}</div>}
                      </td>

                      {/* Stage */}
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 600,
                          background: stageStyle.bg,
                          color: stageStyle.color,
                          textTransform: "capitalize",
                          whiteSpace: "nowrap",
                        }}>
                          {c.lifecycleStage.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* LTV Tier */}
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 600,
                          background: ltvStyle.bg,
                          color: ltvStyle.color,
                          textTransform: "capitalize",
                        }}>
                          {c.ltvTier}
                        </span>
                      </td>

                      {/* Orders */}
                      <td style={{ padding: "14px 20px", fontSize: 14, color: "#e8e8f0", fontVariantNumeric: "tabular-nums" }}>
                        {c.totalOrders}
                      </td>

                      {/* Spend */}
                      <td style={{ padding: "14px 20px", fontSize: 14, color: "#e8e8f0", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        ₹{c.ltv.toLocaleString("en-IN")}
                      </td>

                      {/* Churn */}
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          background: churnStyle.bg,
                          color: churnStyle.color,
                        }}>
                          {c.churnScore}
                        </span>
                      </td>

                      {/* RTO Risk */}
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          background: rtoStyle.bg,
                          color: rtoStyle.color,
                        }}>
                          {c.rtoRiskScore}
                        </span>
                      </td>

                      {/* Last Order */}
                      <td style={{ padding: "14px 20px", fontSize: 13, color: "rgba(232,232,240,0.5)", whiteSpace: "nowrap" }}>
                        {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("en-IN") : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "rgba(232,232,240,0.4)", margin: 0 }}>
              {search ? "No customers match your search." : "No customers yet."}
            </p>
            {!search && (
              <p style={{ fontSize: 13, color: "rgba(232,232,240,0.25)", margin: "8px 0 0" }}>
                Customers appear when they place orders or start a checkout.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
