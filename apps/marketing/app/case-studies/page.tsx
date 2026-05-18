const CASE_STUDIES = [
  {
    title: "From 3 Tools to 1 OS",
    brand: "FastFit (Fashion)",
    metrics: [
      { label: "Tools eliminated", value: "3" },
      { label: "Setup time", value: "2h" },
      { label: "Monthly savings", value: "₹12,000" },
    ],
    story:
      "FastFit was using GoKwik for checkout, Bitespeed for WhatsApp, and Gorgias for support. Three subscriptions, three dashboards, zero integration. When a customer had an issue at checkout, the support team didn't have context. When they wanted to send a broadcast, it went through email instead of WhatsApp. PulseOS unified everything. Now one dashboard, one customer record, instant context. Returns support average resolution time dropped from 6 hours to 15 minutes.",
    results: ["40% faster support resolution", "25% higher email-to-WhatsApp conversion", "1 dashboard instead of 3"],
  },
  {
    title: "RTO Score Saved ₹2L/Month",
    brand: "GreenHome (Home & Living)",
    metrics: [
      { label: "RTO rate", value: "18% → 8%" },
      { label: "Monthly RTO loss", value: "₹2,00,000 saved" },
      { label: "COD blocking accuracy", value: "94%" },
    ],
    story:
      "GreenHome ships 1,500 orders/month. 50% COD. At their RTO rate, they were losing ₹2.2L monthly to failed deliveries and refunds. PulseOS analyzed their first 500 orders and identified 12 high-risk pincodes (80072, 201301, 201012...). It also scored customers: repeat offenders, new customers to high-risk areas, specific payment patterns. They started blocking COD on 18% of orders — the 200 high-risk orders that would statistically RTO. Yes, they lost 200 orders (₹1.8L revenue). But they saved ₹2.2L in RTO losses and refunds. Net gain: ₹400K/month. On top of that, they offered prepaid at +5% discount, converting 80% of blocked orders.",
    results: ["10% RTO reduction", "₹2L/month RTO losses eliminated", "5% prepaid conversion uplift"],
  },
  {
    title: "Daily Briefing Became Decision Tool",
    brand: "TrendyShop (Fashion)",
    metrics: [
      { label: "Daily briefing adoption", value: "100%" },
      { label: "Time spent on dashboards", value: "-40%" },
      { label: "Decision latency", value: "2h → 5min" },
    ],
    story:
      'Every morning at 9pm, the founder gets a conversational WhatsApp message: "Hey! Today: 340 orders (+12%), ₹6.2L revenue, 7 stuck shipments (one in 500072), 14 returns pending, 3 support escalations. At-risk segment: 8 repeat customers silent for 60+ days (₹48K potential churn). We\'ve auto-paused their ads, queued win-back messages for tomorrow." One message. Full context. The founder can instantly decide: "Approve the win-back offers — boost 10%" or "Call me on the NDR shipment." Decisions that used to take 2 hours of dashboard hunting now take 30 seconds.',
    results: ["Decision-making speed 24x faster", "Merchant dashboard time reduced by 40%", "100% briefing adoption rate"],
  },
  {
    title: "Returns Workflow Automated",
    brand: "TechBox (Electronics)",
    metrics: [
      { label: "Manual return handling", value: "4h/day → 10min" },
      { label: "Return approval SLA", value: "24h → instant" },
      { label: "Return-related support tickets", value: "-85%" },
    ],
    story:
      "Before: Customer initiates return → SMS to operations → manual form → WhatsApp to merchant for approval → Shiprocket reverse pickup scheduled → customer told 'we'll call you'. Takes 24–48 hours. After: Customer clicks Return in the tracking page → select items, reason, photo upload → instant eligibility check → if eligible, reverse pickup scheduled immediately → customer gets pickup window on WhatsApp → no human involved. For edge cases (outside return window, damage dispute), system escalates to merchant with full context. Operations team went from 4h/day of manual work to 10 minutes of exception handling.",
    results: ["Return processing automated for 95% of cases", "Return-to-wallet cycle reduced from 7 days to 2 days", "85% fewer support tickets"],
  },
  {
    title: "From Email Blasts to Conversions",
    brand: "BeautyBox (Beauty)",
    metrics: [
      { label: "Campaign open rate", value: "8% → 34%" },
      { label: "Cart recovery conversion", value: "2% → 8%" },
      { label: "Customer feel good about comms", value: "increased 3x" },
    ],
    story:
      "BeautyBox was sending batch emails at 10am every day. Open rate: 8%. Unsubscribe rate: 2%. Customer sentiment: muted. PulseOS changed everything. Instead of batch sends, it sends at the exact time each customer is most likely to reply (BeautyBox discovered 6pm is peak for their audience). Instead of templates, it generates personalized messages that reference purchase history ('You loved the Rose Oil serum, so we curated a collection just for you'). Instead of blast-and-pray, it segments (VIPs get offers, at-risk customers get appreciation, new customers get onboarding). Result: 34% open rate, 8% conversion. Customers feel seen, not targeted.",
    results: ["34% email open rate (4x industry avg)", "8% cart recovery conversion (4x their previous)", "75% say they 'feel seen' by BeautyBox's messaging"],
  },
]

export default function CaseStudiesPage() {
  return (
    <main style={{ padding: "80px 48px 80px", background: "#000" }}>
      {/* Header */}
      <div style={{ maxWidth: 1100, margin: "0 auto", marginBottom: 80, textAlign: "center" }}>
        <h1 style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.5, marginBottom: 16 }}>
          Real businesses, real results
        </h1>
        <p style={{ fontSize: 18, color: "#666", maxWidth: 600, margin: "0 auto" }}>
          This isn't theory. These are D2C brands using PulseOS to automate their operations and grow revenue.
        </p>
      </div>

      {/* Case Studies */}
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 80 }}>
        {CASE_STUDIES.map((study, idx) => (
          <div
            key={study.brand}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 60,
              alignItems: "center",
              paddingBottom: 60,
              borderBottom: idx < CASE_STUDIES.length - 1 ? "1px solid #1a1a1a" : "none",
            }}
          >
            {/* Left: Story */}
            <div style={{ order: idx % 2 === 0 ? 0 : 1 }}>
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: "#666", textTransform: "uppercase", marginBottom: 8 }}>
                  Case Study
                </p>
                <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
                  {study.title}
                </h2>
                <p style={{ fontSize: 14, color: "#999" }}>
                  {study.brand}
                </p>
              </div>

              <p style={{ color: "#888", lineHeight: 1.8, marginBottom: 24, fontSize: 15 }}>
                {study.story}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {study.results.map((result) => (
                  <p key={result} style={{ fontSize: 14, color: "#90EE90", display: "flex", gap: 8 }}>
                    <span>✓</span>
                    <span>{result}</span>
                  </p>
                ))}
              </div>
            </div>

            {/* Right: Metrics */}
            <div style={{ order: idx % 2 === 0 ? 1 : 0 }}>
              <div
                style={{
                  background: "#111",
                  border: "1px solid #222",
                  borderRadius: 16,
                  padding: 40,
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 32,
                }}
              >
                {study.metrics.map((metric) => (
                  <div key={metric.label}>
                    <p style={{ fontSize: 12, color: "#666", textTransform: "uppercase", marginBottom: 8 }}>
                      {metric.label}
                    </p>
                    <p style={{ fontSize: 40, fontWeight: 800, color: "#fff", margin: 0 }}>
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 800, margin: "80px auto 0", textAlign: "center", padding: "60px 40px", borderTop: "1px solid #1a1a1a" }}>
        <h2 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16 }}>
          Your store is next
        </h2>
        <p style={{ fontSize: 16, color: "#666", marginBottom: 32 }}>
          Join 500+ early adopters. Install free. See results in 2 minutes.
        </p>
        <a
          href="/early-access"
          style={{
            display: "inline-block",
            background: "#fff",
            color: "#000",
            padding: "16px 40px",
            borderRadius: 12,
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          Join Early Access →
        </a>
      </div>
    </main>
  )
}
