const PLANS = [
  {
    name: "Starter",
    price: "₹2,999",
    period: "/month",
    description: "For brands doing up to 500 orders/month",
    features: [
      "Checkout OS + Identity capture",
      "WhatsApp automation (5 flows)",
      "Order + shipping notifications",
      "Basic support AI (WISMO, cancel)",
      "Merchant dashboard",
      "Up to 5,000 customers",
    ],
    cta: "Start free trial",
    highlight: false,
  },
  {
    name: "Growth",
    price: "₹7,999",
    period: "/month",
    description: "For brands doing 500–2,000 orders/month",
    features: [
      "Everything in Starter",
      "Full lifecycle automation",
      "Advanced support AI (all intents)",
      "Meta CAPI + Google Ads",
      "RTO intelligence + carrier scoring",
      "Churn prediction + win-backs",
      "Up to 25,000 customers",
    ],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Scale",
    price: "₹19,999",
    period: "/month",
    description: "For brands doing 2,000+ orders/month",
    features: [
      "Everything in Growth",
      "VIP program management",
      "Custom automation builder",
      "Multi-store support",
      "Priority support + onboarding",
      "Unlimited customers",
      "Custom integrations",
    ],
    cta: "Talk to us",
    highlight: false,
  },
]

export default function PricingPage() {
  return (
    <main style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <h1 style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.5, margin: "0 0 16px" }}>
          Simple pricing
        </h1>
        <p style={{ color: "#666", fontSize: 18 }}>
          Replaces ₹2–5k/month of tools. Pays for itself on day one.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            style={{
              background: plan.highlight ? "#fff" : "#111",
              color: plan.highlight ? "#000" : "#fff",
              border: plan.highlight ? "none" : "1px solid #222",
              borderRadius: 20,
              padding: 40,
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 600, color: plan.highlight ? "#666" : "#555", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>
              {plan.name}
            </p>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 48, fontWeight: 800 }}>{plan.price}</span>
              <span style={{ color: plan.highlight ? "#666" : "#555", fontSize: 14 }}>{plan.period}</span>
            </div>
            <p style={{ color: plan.highlight ? "#666" : "#555", fontSize: 14, margin: "0 0 32px" }}>
              {plan.description}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 40px", display: "flex", flexDirection: "column", gap: 12 }}>
              {plan.features.map((f) => (
                <li key={f} style={{ fontSize: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span>✓</span>
                  <span style={{ color: plan.highlight ? "#333" : "#888" }}>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href="https://apps.shopify.com"
              style={{
                display: "block",
                textAlign: "center",
                background: plan.highlight ? "#000" : "#fff",
                color: plan.highlight ? "#fff" : "#000",
                padding: "14px 24px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>
    </main>
  )
}
