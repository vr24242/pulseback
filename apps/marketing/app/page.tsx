const REPLACES = [
  { tool: "GoKwik", what: "Smart checkout" },
  { tool: "Bitespeed", what: "WhatsApp automation" },
  { tool: "Klaviyo", what: "Email/SMS lifecycle" },
  { tool: "Gorgias", what: "Customer support" },
  { tool: "Triple Whale", what: "Analytics" },
  { tool: "AfterShip", what: "Shipping intelligence" },
]

const FEATURES = [
  {
    title: "Checkout OS",
    description:
      "Identity captured the moment they enter their phone. RTO scoring, COD intelligence, pre-fill for returning customers. Converts better, ships better.",
  },
  {
    title: "Communication OS",
    description:
      "WhatsApp-first automation. Abandoned cart recovery, order updates, shipping alerts — all triggered by real events, never batch blasts.",
  },
  {
    title: "Support OS",
    description:
      "Claude handles 80% of tickets. WISMO, returns, cancels — resolved instantly, with full customer context. No more 'what's your order number?'",
  },
  {
    title: "Retention OS",
    description:
      "Churn score updated daily. Repurchase windows predicted per customer. Win-backs triggered before you even notice they're gone.",
  },
  {
    title: "Marketing OS",
    description:
      "Server-side Meta CAPI events. Accurate attribution, better lookalikes, smart suppression. Your ad spend works 30% harder.",
  },
  {
    title: "Merchant AI",
    description:
      "Ask anything in plain English. 'Who are my at-risk customers?' 'What's my RTO rate this month?' Claude answers with live data.",
  },
]

export default function Home() {
  return (
    <main>
      {/* Nav */}
      <nav style={{ padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #222" }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>D2C OS</span>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <a href="/pricing" style={{ color: "#888", textDecoration: "none", fontSize: 14 }}>Pricing</a>
          <a href="/docs" style={{ color: "#888", textDecoration: "none", fontSize: 14 }}>Docs</a>
          <a
            href="https://apps.shopify.com"
            style={{
              background: "#fff",
              color: "#000",
              padding: "8px 20px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Install on Shopify
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "120px 48px", maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "#1a1a1a", border: "1px solid #333", borderRadius: 100, padding: "6px 16px", fontSize: 12, color: "#888", marginBottom: 32 }}>
          Built for D2C brands in India
        </div>
        <h1 style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, margin: "0 0 24px" }}>
          One OS.<br />
          <span style={{ color: "#888" }}>Replace them all.</span>
        </h1>
        <p style={{ fontSize: 20, color: "#888", maxWidth: 600, margin: "0 auto 48px", lineHeight: 1.6 }}>
          From the moment a customer enters their phone number at checkout — D2C OS captures,
          automates, and optimises every step of their journey. No duct tape between 6 tools.
        </p>
        <a
          href="https://apps.shopify.com"
          style={{
            display: "inline-block",
            background: "#fff",
            color: "#000",
            padding: "16px 40px",
            borderRadius: 12,
            textDecoration: "none",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Install Free on Shopify →
        </a>
      </section>

      {/* Replaces */}
      <section style={{ padding: "80px 48px", borderTop: "1px solid #111", borderBottom: "1px solid #111" }}>
        <p style={{ textAlign: "center", color: "#555", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", marginBottom: 48 }}>
          Replaces
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", maxWidth: 800, margin: "0 auto" }}>
          {REPLACES.map((r) => (
            <div
              key={r.tool}
              style={{
                background: "#111",
                border: "1px solid #222",
                borderRadius: 12,
                padding: "16px 24px",
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{r.tool}</p>
              <p style={{ margin: "4px 0 0", color: "#555", fontSize: 12 }}>{r.what}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "120px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1, marginBottom: 64 }}>
          Every Sub-OS.<br />One customer record.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: "#111",
                border: "1px solid #1a1a1a",
                borderRadius: 16,
                padding: 32,
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{f.title}</h3>
              <p style={{ color: "#666", lineHeight: 1.7, fontSize: 14, margin: 0 }}>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "120px 48px", textAlign: "center", borderTop: "1px solid #111" }}>
        <h2 style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.5, margin: "0 0 24px" }}>
          Start in 2 minutes.
        </h2>
        <p style={{ color: "#666", fontSize: 18, marginBottom: 48 }}>
          Install the app. Every customer interaction is automated from day one.
        </p>
        <a
          href="https://apps.shopify.com"
          style={{
            display: "inline-block",
            background: "#fff",
            color: "#000",
            padding: "16px 40px",
            borderRadius: 12,
            textDecoration: "none",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Install on Shopify — Free
        </a>
      </section>

      {/* Footer */}
      <footer style={{ padding: "40px 48px", borderTop: "1px solid #111", display: "flex", justifyContent: "space-between", color: "#444", fontSize: 13 }}>
        <span>© 2025 D2C OS</span>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="/privacy" style={{ color: "#444", textDecoration: "none" }}>Privacy</a>
          <a href="/terms" style={{ color: "#444", textDecoration: "none" }}>Terms</a>
        </div>
      </footer>
    </main>
  )
}
