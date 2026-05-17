import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import { db } from "@d2c/database"
import { requireShop } from "../lib/shop.server"

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await requireShop(request)
  const shopId = shop.id
  const since90d = new Date(Date.now() - 90 * 86_400_000)

  // 1. Pincode RTO heatmap
  //    Group orders by pincode → count total, count RTO, avg rto risk
  const pincodeRaw = await db.order.groupBy({
    by: ["pincode"],
    where: { shopId, pincode: { not: null }, createdAt: { gte: since90d } },
    _count: { id: true },
    _avg: { rtoRisk: true },
    _sum: { totalPrice: true },
    orderBy: { _avg: { rtoRisk: "desc" } },
    take: 15,
  })

  const rtoByPincode = await db.order.groupBy({
    by: ["pincode"],
    where: { shopId, pincode: { not: null }, isRTO: true, createdAt: { gte: since90d } },
    _count: { id: true },
  })
  const rtoCountMap = Object.fromEntries(rtoByPincode.map(r => [r.pincode, r._count.id]))

  const pincodeData = pincodeRaw
    .filter(r => r.pincode && r._count.id >= 1)
    .map(r => ({
      pincode: r.pincode!,
      totalOrders: r._count.id,
      rtoCount: rtoCountMap[r.pincode!] ?? 0,
      rtoRate: Math.round(((rtoCountMap[r.pincode!] ?? 0) / r._count.id) * 100),
      avgRtoScore: Math.round(r._avg.rtoRisk ?? 0),
      revenue: Math.round(r._sum.totalPrice ?? 0),
    }))

  // 2. Carrier performance
  const carriers = await db.shipment.groupBy({
    by: ["carrier"],
    where: { order: { shopId }, createdAt: { gte: since90d } },
    _count: { id: true },
  })
  const carrierNames = carriers.map(c => c.carrier)

  const [carrierDelivered, carrierRTO, carrierStuck, carrierAvgDays] = await Promise.all([
    db.shipment.groupBy({
      by: ["carrier"],
      where: { order: { shopId }, carrier: { in: carrierNames }, status: "delivered", createdAt: { gte: since90d } },
      _count: { id: true },
    }),
    db.shipment.groupBy({
      by: ["carrier"],
      where: { order: { shopId }, carrier: { in: carrierNames }, status: { in: ["rto_initiated", "rto_delivered"] }, createdAt: { gte: since90d } },
      _count: { id: true },
    }),
    db.shipment.groupBy({
      by: ["carrier"],
      where: { order: { shopId }, carrier: { in: carrierNames }, isStuck: true, createdAt: { gte: since90d } },
      _count: { id: true },
    }),
    // Avg delivery time in days (createdAt → deliveredAt)
    db.$queryRaw<Array<{ carrier: string; avg_days: number }>>`
      SELECT s.carrier,
             ROUND(AVG(EXTRACT(EPOCH FROM (s."deliveredAt" - s."createdAt")) / 86400), 1) as avg_days
      FROM "Shipment" s
      JOIN "Order" o ON s."orderId" = o.id
      WHERE o."shopId" = ${shopId}
        AND s."deliveredAt" IS NOT NULL
        AND s."createdAt" >= ${since90d}
      GROUP BY s.carrier
    `.catch(() => [] as Array<{ carrier: string; avg_days: number }>),
  ])

  const deliveredMap = Object.fromEntries(carrierDelivered.map(c => [c.carrier, c._count.id]))
  const rtoMap = Object.fromEntries(carrierRTO.map(c => [c.carrier, c._count.id]))
  const stuckMap = Object.fromEntries(carrierStuck.map(c => [c.carrier, c._count.id]))
  const avgDaysMap = Object.fromEntries(carrierAvgDays.map(c => [c.carrier, Number(c.avg_days)]))

  const carrierData = carriers.map(c => {
    const total = c._count.id
    const delivered = deliveredMap[c.carrier] ?? 0
    const rto = rtoMap[c.carrier] ?? 0
    const stuck = stuckMap[c.carrier] ?? 0
    return {
      carrier: c.carrier,
      total,
      delivered,
      rtoCount: rto,
      rtoRate: total > 0 ? Math.round((rto / total) * 100) : 0,
      stuckRate: total > 0 ? Math.round((stuck / total) * 100) : 0,
      avgDeliveryDays: avgDaysMap[c.carrier] ?? null,
      deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    }
  }).sort((a, b) => b.total - a.total)

  // 3. UTM attribution quality
  const utmRaw = await db.checkoutSession.groupBy({
    by: ["utmSource"],
    where: { shopId, utmSource: { not: null }, createdAt: { gte: since90d } },
    _count: { id: true },
    _avg: { rtoRiskAtCheckout: true },
  })

  const utmConverted = await db.checkoutSession.groupBy({
    by: ["utmSource"],
    where: { shopId, utmSource: { not: null }, status: "completed", createdAt: { gte: since90d } },
    _count: { id: true },
  })
  const utmConvMap = Object.fromEntries(utmConverted.map(u => [u.utmSource, u._count.id]))

  // Revenue by UTM source (via completed sessions → orders)
  const utmRevenue = await db.$queryRaw<Array<{ utm_source: string; revenue: number }>>`
    SELECT cs."utmSource" as utm_source, COALESCE(SUM(o."totalPrice"), 0) as revenue
    FROM "CheckoutSession" cs
    JOIN "Order" o ON o."shopId" = cs."shopId"
      AND o."createdAt" >= cs."createdAt" - interval '1 hour'
      AND o."createdAt" <= cs."createdAt" + interval '2 hours'
    WHERE cs."shopId" = ${shopId}
      AND cs."utmSource" IS NOT NULL
      AND cs."createdAt" >= ${since90d}
    GROUP BY cs."utmSource"
  `.catch(() => [] as Array<{ utm_source: string; revenue: number }>)
  const utmRevMap = Object.fromEntries(utmRevenue.map(u => [u.utm_source, Number(u.revenue)]))

  const utmData = utmRaw
    .filter(u => u.utmSource)
    .map(u => ({
      source: u.utmSource!,
      sessions: u._count.id,
      converted: utmConvMap[u.utmSource!] ?? 0,
      convRate: Math.round(((utmConvMap[u.utmSource!] ?? 0) / u._count.id) * 100),
      avgRtoScore: Math.round(u._avg.rtoRiskAtCheckout ?? 0),
      revenue: Math.round(utmRevMap[u.utmSource!] ?? 0),
    }))
    .sort((a, b) => b.sessions - a.sessions)

  // 4. Summary KPIs
  const [totalOrders90d, rtoOrders90d, totalShipments, deliveredShipments, avgOrderValue] = await Promise.all([
    db.order.count({ where: { shopId, createdAt: { gte: since90d } } }),
    db.order.count({ where: { shopId, isRTO: true, createdAt: { gte: since90d } } }),
    db.shipment.count({ where: { order: { shopId }, createdAt: { gte: since90d } } }),
    db.shipment.count({ where: { order: { shopId }, status: "delivered", createdAt: { gte: since90d } } }),
    db.order.aggregate({ where: { shopId, createdAt: { gte: since90d } }, _avg: { totalPrice: true } }),
  ])

  return json({
    shopDomain: shop.domain,
    pincodeData,
    carrierData,
    utmData,
    kpi: {
      totalOrders90d,
      rtoRate90d: totalOrders90d > 0 ? Math.round((rtoOrders90d / totalOrders90d) * 100) : 0,
      deliveryRate: totalShipments > 0 ? Math.round((deliveredShipments / totalShipments) * 100) : 0,
      avgOrderValue: Math.round(avgOrderValue._avg.totalPrice ?? 0),
    },
  })
}

// ─── Carrier label map ────────────────────────────────────────────────────────

const CARRIER_LABEL: Record<string, string> = {
  shiprocket: "Shiprocket",
  delhivery: "Delhivery",
  bluedart: "BlueDart",
  xpressbees: "Xpressbees",
  ecom: "Ecom Express",
  dtdc: "DTDC",
  ekart: "Ekart",
  shadowfax: "Shadowfax",
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg: "#0f0f13",
  card: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.08)",
  accent: "#6c63ff",
  textPrimary: "#e8e8f0",
  textMuted: "rgba(232,232,240,0.5)",
  red: "#ff4d6d",
  redBg: "rgba(255,77,109,0.15)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.15)",
  green: "#22c55e",
  greenBg: "rgba(34,197,94,0.15)",
  accentBg: "rgba(108,99,255,0.12)",
  radius: "16px",
  radiusSm: "8px",
  radiusXs: "6px",
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { pincodeData, carrierData, utmData, kpi } = useLoaderData<typeof loader>()

  const maxPincodeOrders = pincodeData.length > 0
    ? Math.max(...pincodeData.map(p => p.totalOrders))
    : 1

  const maxCarrierTotal = carrierData.length > 0
    ? Math.max(...carrierData.map(c => c.total))
    : 1

  return (
    <div style={{ background: T.bg, minHeight: "100vh", padding: "32px 28px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", color: T.textPrimary, boxSizing: "border-box" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.3px" }}>
            Analytics
          </h1>
          <span style={{
            fontSize: "11px",
            fontWeight: 600,
            color: T.accent,
            background: T.accentBg,
            border: `1px solid rgba(108,99,255,0.3)`,
            borderRadius: "20px",
            padding: "3px 10px",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}>
            Last 90 days
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "14px", color: T.textMuted, lineHeight: 1.5 }}>
          Data intelligence across orders, carriers, and acquisition channels.
        </p>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "28px" }}>
        <KpiCard label="Orders (90d)" value={kpi.totalOrders90d.toLocaleString("en-IN")} />
        <KpiCard
          label="Overall RTO Rate"
          value={`${kpi.rtoRate90d}%`}
          color={kpi.rtoRate90d > 20 ? T.red : kpi.rtoRate90d > 10 ? T.amber : T.green}
        />
        <KpiCard
          label="Delivery Rate"
          value={`${kpi.deliveryRate}%`}
          color={kpi.deliveryRate > 90 ? T.green : kpi.deliveryRate > 75 ? T.amber : T.red}
        />
        <KpiCard label="Avg Order Value" value={`₹${kpi.avgOrderValue.toLocaleString("en-IN")}`} />
      </div>

      {/* ── Pincode RTO Heatmap ── */}
      <SectionCard
        icon="📍"
        title="Pincode RTO Heatmap"
        subtitle="Pincodes ranked by RTO risk. Use this to tighten COD rules or increase deposit for high-risk zones."
        style={{ marginBottom: "28px" }}
      >
        {pincodeData.length === 0 ? (
          <EmptyState msg="No pincode data yet. Orders will populate this once they arrive." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["Pincode", "Orders", "RTO Count", "RTO Rate", "Risk Score", "Revenue"].map(h => (
                    <th key={h} style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      color: T.textMuted,
                      fontWeight: 600,
                      fontSize: "11px",
                      letterSpacing: "0.6px",
                      textTransform: "uppercase",
                      borderBottom: `1px solid ${T.cardBorder}`,
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pincodeData.map((p, i) => (
                  <tr
                    key={p.pincode}
                    style={{ background: i % 2 === 0 ? "transparent" : T.card }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : T.card)}
                  >
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: T.textPrimary }}>
                      {p.pincode}
                    </td>
                    <td style={{ padding: "12px 14px", color: T.textPrimary }}>
                      <div>{p.totalOrders}</div>
                      <div style={{ marginTop: "5px", height: "3px", background: "rgba(255,255,255,0.08)", borderRadius: "2px", width: "80px" }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.round((p.totalOrders / maxPincodeOrders) * 100)}%`,
                          background: T.accent,
                          borderRadius: "2px",
                        }} />
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", color: T.textMuted }}>{p.rtoCount}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <RatePill rate={p.rtoRate} />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <RiskPill score={p.avgRtoScore} />
                    </td>
                    <td style={{ padding: "12px 14px", color: T.textPrimary, whiteSpace: "nowrap" }}>
                      ₹{p.revenue.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.cardBorder}`, marginTop: "4px" }}>
              <span style={{ fontSize: "12px", color: T.textMuted }}>
                🔴 RTO rate &gt;30% &nbsp;·&nbsp; 🟡 10–30% &nbsp;·&nbsp; 🟢 &lt;10% &nbsp;·&nbsp; Sorted by average risk score
              </span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Carrier Performance ── */}
      <SectionCard
        icon="🚚"
        title="Carrier Performance"
        subtitle="Compare delivery speed, RTO rate, and stuck shipments across all your carriers."
        style={{ marginBottom: "28px" }}
      >
        {carrierData.length === 0 ? (
          <EmptyState msg="No shipment data yet. Carrier stats appear once orders are dispatched." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["Carrier", "Shipments", "Delivery Rate", "RTO Rate", "Stuck Rate", "Avg Days"].map(h => (
                    <th key={h} style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      color: T.textMuted,
                      fontWeight: 600,
                      fontSize: "11px",
                      letterSpacing: "0.6px",
                      textTransform: "uppercase",
                      borderBottom: `1px solid ${T.cardBorder}`,
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {carrierData.map((c, i) => (
                  <tr
                    key={c.carrier}
                    style={{ background: i % 2 === 0 ? "transparent" : T.card }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : T.card)}
                  >
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: T.textPrimary }}>
                      {CARRIER_LABEL[c.carrier] ?? c.carrier}
                    </td>
                    <td style={{ padding: "12px 14px", color: T.textPrimary }}>{c.total}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        <DeliveryRatePill rate={c.deliveryRate} />
                        <div style={{ height: "3px", background: "rgba(255,255,255,0.08)", borderRadius: "2px", width: "80px" }}>
                          <div style={{
                            height: "100%",
                            width: `${c.deliveryRate}%`,
                            background: c.deliveryRate > 90 ? T.green : c.deliveryRate > 75 ? T.amber : T.red,
                            borderRadius: "2px",
                          }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <RatePill rate={c.rtoRate} />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <RatePill rate={c.stuckRate} />
                    </td>
                    <td style={{ padding: "12px 14px", color: T.textMuted }}>
                      {c.avgDeliveryDays != null ? `${c.avgDeliveryDays}d` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── UTM / Campaign Attribution ── */}
      <SectionCard
        icon="📣"
        title="Campaign Quality Attribution"
        subtitle="Which ad sources bring buyers with low RTO risk and high conversion? Reallocate budget accordingly."
      >
        {utmData.length === 0 ? (
          <EmptyState msg="No UTM data yet. Add UTM params to your ad URLs and checkout link to track sources." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["Source", "Sessions", "Converted", "Conv. Rate", "Buyer RTO Score", "Revenue"].map(h => (
                    <th key={h} style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      color: T.textMuted,
                      fontWeight: 600,
                      fontSize: "11px",
                      letterSpacing: "0.6px",
                      textTransform: "uppercase",
                      borderBottom: `1px solid ${T.cardBorder}`,
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {utmData.map((u, i) => (
                  <tr
                    key={u.source}
                    style={{ background: i % 2 === 0 ? "transparent" : T.card }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : T.card)}
                  >
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: T.textPrimary }}>{u.source}</td>
                    <td style={{ padding: "12px 14px", color: T.textPrimary }}>{u.sessions.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "12px 14px", color: T.textMuted }}>{u.converted.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <ConvPill rate={u.convRate} />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <RiskPill score={u.avgRtoScore} />
                    </td>
                    <td style={{ padding: "12px 14px", color: T.textPrimary, whiteSpace: "nowrap" }}>
                      ₹{u.revenue.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{
              margin: "16px 14px 4px",
              padding: "12px 16px",
              background: T.accentBg,
              border: `1px solid rgba(108,99,255,0.25)`,
              borderRadius: T.radiusSm,
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}>
              <span style={{ fontSize: "16px" }}>💡</span>
              <span style={{ fontSize: "12px", color: T.textMuted, lineHeight: 1.5 }}>
                <strong style={{ color: T.textPrimary }}>Low RTO score + high conversion = quality traffic.</strong>
                &nbsp;High RTO score = restrict COD for that source.
              </span>
            </div>
          </div>
        )}
      </SectionCard>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: T.radius,
      padding: "20px 22px",
    }}>
      <div style={{ fontSize: "12px", color: T.textMuted, fontWeight: 500, marginBottom: "10px", letterSpacing: "0.3px" }}>
        {label}
      </div>
      <div style={{
        fontSize: "28px",
        fontWeight: 700,
        color: color ?? T.textPrimary,
        letterSpacing: "-0.5px",
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  )
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
  style,
}: {
  icon: string
  title: string
  subtitle: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: T.radius,
      overflow: "hidden",
      ...style,
    }}>
      <div style={{ padding: "20px 22px 16px", borderLeft: `3px solid ${T.accent}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span style={{ fontSize: "16px" }}>{icon}</span>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.2px" }}>
            {title}
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: "12px", color: T.textMuted, lineHeight: 1.5 }}>{subtitle}</p>
      </div>
      <div style={{ borderTop: `1px solid ${T.cardBorder}` }}>
        {children}
      </div>
    </div>
  )
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 9px",
      borderRadius: "20px",
      fontSize: "11px",
      fontWeight: 700,
      color,
      background: bg,
      letterSpacing: "0.3px",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  )
}

function RatePill({ rate }: { rate: number }) {
  if (rate > 30) return <Pill label={`${rate}%`} color={T.red} bg={T.redBg} />
  if (rate >= 10) return <Pill label={`${rate}%`} color={T.amber} bg={T.amberBg} />
  return <Pill label={`${rate}%`} color={T.green} bg={T.greenBg} />
}

function DeliveryRatePill({ rate }: { rate: number }) {
  if (rate > 90) return <Pill label={`${rate}%`} color={T.green} bg={T.greenBg} />
  if (rate > 75) return <Pill label={`${rate}%`} color={T.amber} bg={T.amberBg} />
  return <Pill label={`${rate}%`} color={T.red} bg={T.redBg} />
}

function RiskPill({ score }: { score: number }) {
  if (score > 60) return <Pill label={String(score)} color={T.red} bg={T.redBg} />
  if (score > 40) return <Pill label={String(score)} color={T.amber} bg={T.amberBg} />
  return <Pill label={String(score)} color={T.green} bg={T.greenBg} />
}

function ConvPill({ rate }: { rate: number }) {
  if (rate > 30) return <Pill label={`${rate}%`} color={T.green} bg={T.greenBg} />
  if (rate > 10) return <Pill label={`${rate}%`} color={T.amber} bg={T.amberBg} />
  return <Pill label={`${rate}%`} color={T.red} bg={T.redBg} />
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center" }}>
      <p style={{ margin: 0, fontSize: "13px", color: T.textMuted, lineHeight: 1.6 }}>{msg}</p>
    </div>
  )
}
