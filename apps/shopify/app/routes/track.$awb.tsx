import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import { db } from "@d2c/database"

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const awb = params.awb ?? ""

  const shipment = await db.shipment.findUnique({
    where: { awb },
    include: {
      order: {
        select: {
          shopifyOrderName: true,
          totalPrice: true,
          currency: true,
          status: true,
          createdAt: true,
          shop: { select: { name: true } },
        },
      },
    },
  })

  if (!shipment) {
    return json({ found: false, awb } as const)
  }

  const events = (shipment.trackingEvents as unknown as TrackingEvent[]) ?? []

  return json({
    found: true,
    awb,
    carrier: shipment.carrier,
    status: shipment.status,
    estimatedDelivery: shipment.estimatedDelivery?.toISOString() ?? null,
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    lastScannedAt: shipment.lastScannedAt?.toISOString() ?? null,
    isStuck: shipment.isStuck,
    events,
    order: {
      name: shipment.order.shopifyOrderName,
      shopName: shipment.order.shop.name ?? "the store",
      totalPrice: shipment.order.totalPrice,
      currency: shipment.order.currency,
      orderStatus: shipment.order.status,
      createdAt: shipment.order.createdAt.toISOString(),
    },
  } as const)
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; description: string }> = {
  created:            { label: "Order Created",         color: "#6c63ff", icon: "📦", description: "Your order has been placed and is being prepared." },
  in_transit:         { label: "In Transit",            color: "#2196F3", icon: "🚚", description: "Your package is on its way." },
  out_for_delivery:   { label: "Out for Delivery",      color: "#FF9800", icon: "🏃", description: "Your package is out for delivery today!" },
  delivered:          { label: "Delivered",             color: "#4CAF50", icon: "✅", description: "Your package has been delivered." },
  failed_delivery:    { label: "Delivery Attempted",    color: "#FF5722", icon: "⚠️", description: "Delivery was attempted but unsuccessful. We'll try again." },
  rto_initiated:      { label: "Returning to Seller",   color: "#9E9E9E", icon: "↩️", description: "The package is being returned. Please contact the store." },
  rto_delivered:      { label: "Returned to Seller",    color: "#9E9E9E", icon: "✓",  description: "The package has been returned to the seller." },
  exception:          { label: "Exception",             color: "#f44336", icon: "🚨", description: "There's an issue with your delivery. Please contact support." },
}

const STEPS = ["created", "in_transit", "out_for_delivery", "delivered"]

interface TrackingEvent {
  status: string
  description: string
  location?: string
  timestamp: string
}

export default function TrackPage() {
  const data = useLoaderData<typeof loader>()

  if (!data.found) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#202223" }}>Tracking not found</h2>
          <p style={{ color: "#6d7175", margin: 0 }}>
            No shipment found for AWB <strong>{data.awb}</strong>.<br />
            It may take a few hours for tracking to activate after dispatch.
          </p>
        </div>
      </Shell>
    )
  }

  const config = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.in_transit
  const isRTO = data.status.startsWith("rto")
  const activeStep = isRTO ? -1 : STEPS.indexOf(data.status)

  return (
    <Shell shopName={data.order.shopName}>
      {/* Status hero */}
      <div style={{
        background: `linear-gradient(135deg, ${config.color}22, ${config.color}11)`,
        border: `1px solid ${config.color}33`,
        borderRadius: 16,
        padding: "32px 24px",
        textAlign: "center",
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{config.icon}</div>
        <h1 style={{ margin: "0 0 6px", fontSize: 24, color: config.color, fontWeight: 700 }}>
          {config.label}
        </h1>
        <p style={{ margin: "0 0 16px", color: "#6d7175", fontSize: 14 }}>
          {config.description}
        </p>
        <div style={{ display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Chip label="Order" value={data.order.name} />
          <Chip label="AWB" value={data.awb} />
          <Chip label="Carrier" value={data.carrier} />
        </div>
      </div>

      {/* Progress bar (not shown for RTO) */}
      {!isRTO && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {STEPS.map((step, i) => {
              const stepConfig = STATUS_CONFIG[step]
              const done = i <= activeStep
              const active = i === activeStep
              return (
                <div key={step} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto" }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: done ? config.color : "#e1e3e5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      border: active ? `3px solid ${config.color}` : "none",
                      boxShadow: active ? `0 0 0 3px ${config.color}33` : "none",
                      transition: "all 0.3s",
                    }}>
                      {done ? <span style={{ fontSize: 14 }}>{stepConfig.icon}</span> : ""}
                    </div>
                    <span style={{ fontSize: 11, color: done ? config.color : "#8c9196", marginTop: 4, textAlign: "center", maxWidth: 70 }}>
                      {stepConfig.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{
                      flex: 1,
                      height: 3,
                      background: i < activeStep ? config.color : "#e1e3e5",
                      margin: "0 4px",
                      marginBottom: 20,
                      borderRadius: 2,
                      transition: "background 0.3s",
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Estimated delivery */}
      {data.estimatedDelivery && data.status !== "delivered" && (
        <div style={{
          background: "#fff8e1",
          border: "1px solid #ffe082",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div>
            <div style={{ fontSize: 12, color: "#6d7175" }}>Estimated Delivery</div>
            <div style={{ fontWeight: 600, color: "#202223" }}>
              {new Date(data.estimatedDelivery).toLocaleDateString("en-IN", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tracking events */}
      {data.events.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e1e3e5", padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "#202223" }}>Tracking History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {data.events.map((event, i) => (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: i === 0 ? config.color : "#c9cccf",
                    marginTop: 5, flexShrink: 0,
                  }} />
                  {i < data.events.length - 1 && (
                    <div style={{ width: 2, flex: 1, background: "#e1e3e5", margin: "4px 0" }} />
                  )}
                </div>
                <div style={{ paddingBottom: i < data.events.length - 1 ? 16 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#202223" }}>{event.description}</div>
                  {event.location && <div style={{ fontSize: 12, color: "#6d7175" }}>{event.location}</div>}
                  <div style={{ fontSize: 11, color: "#8c9196", marginTop: 2 }}>
                    {new Date(event.timestamp).toLocaleString("en-IN", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order summary */}
      <div style={{ background: "#f6f6f7", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, color: "#6d7175", marginBottom: 8 }}>Order Summary</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#202223" }}>{data.order.name}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#202223" }}>
            ₹{data.order.totalPrice.toLocaleString("en-IN")}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#6d7175", marginTop: 4 }}>
          Ordered {new Date(data.order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children, shopName }: { children: React.ReactNode; shopName?: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <div style={{
        background: "#1a1a2e",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>⚡</span>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
            {shopName ? `${shopName}` : "Order Tracking"}
          </div>
          <div style={{ color: "#888", fontSize: 11 }}>Powered by Pulseback</div>
        </div>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
        {children}
      </div>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.7)",
      borderRadius: 8,
      padding: "6px 12px",
      fontSize: 12,
    }}>
      <span style={{ color: "#6d7175" }}>{label}: </span>
      <span style={{ fontWeight: 600, color: "#202223" }}>{value}</span>
    </div>
  )
}
