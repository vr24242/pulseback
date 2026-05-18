"use client"

import React from "react"
import { TopNav } from "@/components/chrome/TopNav"
import { Footer } from "@/components/chrome/Footer"
import { Button } from "@/components/ui/Button"
import { Card } from "@/components/ui/Card"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { Chip } from "@/components/ui/Chip"
import { FinalCTA } from "@/components/sections/FinalCTA"

export default function Home() {
  return (
    <>
      <TopNav active="/" />

      {/* === HERO SECTION === */}
      <section className="pb-section-large" style={{ marginTop: "var(--topbar-h)", paddingTop: "var(--s-10)" }}>
        <div className="pb-container">
          <div className="max-w-3xl">
            <Eyebrow>⌥ Autonomy meets insight</Eyebrow>
            <h1 className="pb-h1 mb-6">
              The AI operations team your D2C brand can't afford to hire.
            </h1>
            <p className="pb-lead text-[var(--text-2)] mb-8">
              Pulseback runs in the background of your Shopify store. It autonomously handles checkout scoring,
              customer support, returns logistics, retention campaigns, analytics, inventory, and financial
              reconciliation — all personalized to your customers' behavior, all learning and compounding every day.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Button variant="primary" size="lg" href="/contact">
                Book a demo →
              </Button>
              <Button variant="secondary" size="lg" href="/how-it-works">
                Learn how it works
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* === THE 7 DOMAIN AGENTS === */}
      <section className="pb-section bg-[var(--soft)]">
        <div className="pb-container">
          <div className="text-center mb-12">
            <Eyebrow>◇ The seven operating systems</Eyebrow>
            <h2 className="pb-h2">One AI. Seven workflows. Complete autonomy.</h2>
            <p className="text-[var(--text-2)] max-w-2xl mx-auto mt-4">
              Each domain agent owns its workflow. Together, they orchestrate your entire business.
            </p>
          </div>

          <div className="pb-grid-3">
            {[
              {
                icon: "✦",
                title: "Checkout OS",
                color: "blue",
                description: "RTO scoring, pincode intelligence, COD blocking, payment optimization",
              },
              {
                icon: "★",
                title: "WhatsApp Agent OS",
                color: "green",
                description: "Multilingual support, intent classification, personalized responses, proactive help",
              },
              {
                icon: "▶",
                title: "NDR OS",
                color: "cyan",
                description: "Shipment triage, address correction, reverse pickup, RTO management",
              },
              {
                icon: "⌥",
                title: "Retention OS",
                color: "purple",
                description: "Churn prediction, segment-specific campaigns, win-back offers, lifecycle intelligence",
              },
              {
                icon: "◇",
                title: "Analytics OS",
                color: "lime",
                description: "Conversational queries, cohort analysis, weekly pattern discovery, anomaly alerts",
              },
              {
                icon: "✦",
                title: "Finance OS",
                color: "blue",
                description: "COD float tracking, true ROAS, cash flow forecasts, reconciliation",
              },
            ].map((os) => (
              <Card key={os.title} padding="feature" hover className="flex flex-col">
                <div className="text-3xl mb-3">{os.icon}</div>
                <h3 className="font-bold text-lg mb-2">{os.title}</h3>
                <p className="text-[var(--text-3)] text-sm flex-1">{os.description}</p>
                <Chip color={os.color as any} className="mt-4 w-fit">
                  {os.title.replace(" OS", "")}
                </Chip>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* === HOW IT WORKS: THE 3-PHASE SYSTEM === */}
      <section className="pb-section">
        <div className="pb-container">
          <div className="text-center mb-12">
            <Eyebrow>⌚ The three phases</Eyebrow>
            <h2 className="pb-h2">
              <span className="pb-italic text-[var(--neon-blue-3)]">Connect.</span>
              <span className="pb-italic text-[var(--neon-green-3)] ml-3">Learn.</span>
              <span className="pb-italic text-[var(--accent-pink)] ml-3">Automate.</span>
            </h2>
          </div>

          <div className="space-y-12">
            {[
              {
                number: 1,
                phase: "Connect",
                color: "text-[var(--neon-blue-3)]",
                description:
                  "Pulseback plugs into your Shopify store, Razorpay, Shiprocket, WhatsApp, and your existing tools. One webhook, thousands of events flow in.",
                steps: [
                  "Install Pulseback app on Shopify",
                  "Connect your logistics provider (Shiprocket, Delhivery, etc.)",
                  "Enable WhatsApp for customer comms",
                  "Sync your customer data",
                ],
              },
              {
                number: 2,
                phase: "Learn",
                color: "text-[var(--neon-green-3)]",
                description:
                  "For the first 14 days, Pulseback observes your business. It analyzes RTO patterns, customer behavior, communication responsiveness, order timing, and outcomes.",
                steps: [
                  "Agents track all decisions and outcomes",
                  "RFM scores compute for every customer",
                  "RTO model trains on your order history",
                  "Weekly patterns discovered automatically",
                ],
              },
              {
                number: 3,
                phase: "Automate",
                color: "text-[var(--accent-pink)]",
                description:
                  "From Day 15 onwards, agents make autonomous decisions. Block high-risk COD orders. Send personalized win-back campaigns. Update stuck shipment addresses. File refunds. All logged, reversible, and learning daily.",
                steps: [
                  "Agents propose decisions with reasoning",
                  "Calendar agent prevents duplicate comms",
                  "Merchants approve exceptions via WhatsApp",
                  "Outcomes feed back into the model",
                ],
              },
            ].map((phase) => (
              <div key={phase.number} className="flex gap-8 items-start">
                <div className={`text-8xl font-bold opacity-10 ${phase.color}`}>{phase.number}</div>
                <div className="flex-1">
                  <h3 className={`pb-h3 ${phase.color} mb-3`}>{phase.phase}</h3>
                  <p className="text-[var(--text-2)] mb-6">{phase.description}</p>
                  <ul className="space-y-2">
                    {phase.steps.map((step) => (
                      <li key={step} className="flex gap-3 text-sm">
                        <span className="text-[var(--lime)]">✓</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === THE INTELLIGENCE LOOP === */}
      <section className="pb-section bg-[var(--canvas)]">
        <div className="pb-container">
          <div className="text-center mb-12">
            <Eyebrow>★ The compounding advantage</Eyebrow>
            <h2 className="pb-h2">Smarter every single day.</h2>
            <p className="text-[var(--text-2)] max-w-2xl mx-auto">
              Every decision Pulseback makes is recorded. Every outcome feeds back. The model improves automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <Card padding="feature">
              <h3 className="pb-h3 mb-4">Your monthly intelligence report</h3>
              <p className="text-[var(--text-2)] mb-6">
                Pulseback analyzes 30 days of decisions and outcomes. It discovers patterns no human team would find.
              </p>
              <ul className="space-y-3 text-sm">
                <li className="flex gap-2">
                  <span className="text-[var(--neon-green)]">→</span>
                  "Tuesday 6pm abandonment follow-ups convert 3.1x vs Sunday"
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--neon-green)]">→</span>
                  "Customers from Google Ads have 2.4x higher RTO risk"
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--neon-green)]">→</span>
                  "Hindi-language customers respond to empathy messaging 2.7x better"
                </li>
              </ul>
            </Card>

            <Card padding="feature">
              <h3 className="pb-h3 mb-4">Zero-touch agent improvement</h3>
              <p className="text-[var(--text-2)] mb-6">
                Merchants set thresholds. Agents propose decisions. Merchants approve exceptions. The system learns.
              </p>
              <ul className="space-y-3 text-sm">
                <li className="flex gap-2">
                  <span className="text-[var(--neon-blue)]">→</span>
                  Merchant overrides decision 3 times → agent weights adjust
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--neon-blue)]">→</span>
                  Communication succeeds 80% → model increases send frequency
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--neon-blue)]">→</span>
                  RTO decision leads to refund → pincode risk model updates
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* === BEFORE & AFTER === */}
      <section className="pb-section">
        <div className="pb-container">
          <div className="text-center mb-12">
            <Eyebrow>▶ The transformation</Eyebrow>
            <h2 className="pb-h2">What changes on day 1.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <h3 className="pb-h3 mb-6 text-[var(--text-3)]">Without Pulseback</h3>
              <ul className="space-y-4">
                {[
                  "Manual RTO checks every order",
                  "Support team answers 'where is my order' 50x/day",
                  "Abandoned carts require manual recovery",
                  "Returns processed via email chains",
                  "Stuck shipments discovered by complaint",
                  "Analytics in spreadsheets updated monthly",
                  "Refunds delayed for approval",
                  "Customer churn is a surprise",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="text-[var(--text-4)] line-through">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="pb-h3 mb-6 text-[var(--lime)]">With Pulseback</h3>
              <ul className="space-y-4">
                {[
                  "RTO scored automatically at checkout",
                  "WhatsApp bot handles 95% of inquiries",
                  "Abandoned carts recovered autonomously",
                  "Returns portal + instant Shiprocket pickup",
                  "Stuck shipments auto-detected and recovered",
                  "Live dashboard with conversational queries",
                  "Refunds auto-approved under thresholds",
                  "Churn predicted, win-back sent before it happens",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="text-[var(--lime)]">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* === SOCIAL PROOF === */}
      <section className="pb-section bg-[var(--soft)]">
        <div className="pb-container text-center">
          <Eyebrow>☆ Trusted by D2C leaders</Eyebrow>
          <h2 className="pb-h2 mb-12">Brands shipping 1K–100K orders/month</h2>

          <div className="pb-grid-3 mb-12">
            {[
              {
                metric: "8.3x",
                label: "Return rate reduction",
                source: "Unbrand Store, 3-month average",
              },
              {
                metric: "₹4.2L/mo",
                label: "COD float unlocked",
                source: "Through RTO accuracy improvements",
              },
              {
                metric: "96%",
                label: "Customer queries resolved autonomously",
                source: "WhatsApp agent without escalation",
              },
              {
                metric: "3.4x",
                label: "Win-back conversion improvement",
                source: "vs manual campaigns",
              },
              {
                metric: "42h",
                label: "Weekly ops time freed up",
                source: "Merchant reported",
              },
              {
                metric: "Day 15",
                label: "Time to ROI positive",
                source: "For typical ₹2L/mo brands",
              },
            ].map((stat) => (
              <Card key={stat.metric} padding="default">
                <div className="text-4xl font-bold text-[var(--neon-blue-3)] mb-2">{stat.metric}</div>
                <div className="font-semibold mb-1">{stat.label}</div>
                <div className="text-xs text-[var(--text-3)]">{stat.source}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* === TESTIMONIALS === */}
      <section className="pb-section">
        <div className="pb-container">
          <div className="text-center mb-12">
            <Eyebrow>◇ What brands say</Eyebrow>
          </div>

          <div className="pb-grid-3">
            {[
              {
                quote:
                  "We fired our returns vendor and saved ₹60K/month. Pulseback handles everything now, faster and with fewer complaints.",
                author: "Founder, Fashion D2C",
                role: "₹8Cr/year brand",
              },
              {
                quote:
                  "Our support team went from 5 people to 1 supervisor. The WhatsApp bot handles 95% of questions. The remaining 5% are escalated instantly with full context.",
                author: "Ops Lead, Electronics Store",
                role: "₹12Cr/year brand",
              },
              {
                quote:
                  "The RTO model blocked 300 orders that would've cost us ₹8L in refunds. Pulseback pays for itself in one month.",
                author: "Founder, Beauty Brand",
                role: "₹5Cr/year brand",
              },
            ].map((testimonial) => (
              <Card key={testimonial.author} padding="feature">
                <p className="text-[var(--text-2)] mb-6 italic">"{testimonial.quote}"</p>
                <div className="border-t border-[var(--line)] pt-4">
                  <div className="font-semibold">{testimonial.author}</div>
                  <div className="text-xs text-[var(--text-3)]">{testimonial.role}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* === PRICING (TEASER) === */}
      <section className="pb-section bg-[var(--cream)]">
        <div className="pb-container">
          <div className="text-center mb-12">
            <Eyebrow>💸 Pricing for growth</Eyebrow>
            <h2 className="pb-h2">Start where you are. Scale as you grow.</h2>
          </div>

          <div className="pb-grid-3">
            {[
              { name: "Starter", price: "₹29,999", orders: "Up to 10K/mo" },
              { name: "Growth", price: "₹79,999", orders: "10K–50K/mo" },
              { name: "Enterprise", price: "Custom", orders: "50K+/mo" },
            ].map((plan) => (
              <Card key={plan.name} padding="feature" className="flex flex-col">
                <h3 className="pb-h3 mb-2">{plan.name}</h3>
                <div className="text-3xl font-bold mb-2">{plan.price}</div>
                <div className="text-sm text-[var(--text-3)] mb-6">{plan.orders}</div>
                <Button variant="primary" size="md" className="mt-auto">
                  Learn more
                </Button>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button variant="secondary" size="lg" href="/pricing">
              See full pricing & features
            </Button>
          </div>
        </div>
      </section>

      {/* === FAQ === */}
      <section className="pb-section">
        <div className="pb-container max-w-2xl">
          <div className="text-center mb-12">
            <Eyebrow>? Questions answered</Eyebrow>
            <h2 className="pb-h2">Common questions</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "How long before Pulseback starts helping?",
                a: "By day 1, it's scoring orders for RTO risk. By day 15, it's autonomously making decisions. By day 30, you'll see measurable impact on COD float, support volume, and return rate.",
              },
              {
                q: "What if I don't like a decision Pulseback makes?",
                a: "Every decision is logged with reasoning. You can override it instantly via WhatsApp. The system learns from your feedback and adjusts weights for future decisions.",
              },
              {
                q: "Can I use Pulseback with a custom order management system?",
                a: "If your system has webhooks or APIs, yes. We integrate with Shopify, WooCommerce, and custom stacks. Talk to our team about your setup.",
              },
              {
                q: "Is my customer data safe?",
                a: "Yes. Data is encrypted in transit and at rest. We use Supabase (AWS-backed). Compliance: DPDP Act (India), ISO 27001 ready.",
              },
              {
                q: "What's the commitment term?",
                a: "Month-to-month. Cancel anytime. Most brands see ROI in 30 days, so they never need to.",
              },
              {
                q: "How does pricing scale?",
                a: "Starter (≤10K/mo), Growth (10K–50K/mo), Enterprise (50K+/mo). Billing is monthly based on your monthly order volume.",
              },
            ].map((faq) => (
              <details key={faq.q} className="pb-card pb-card-default group cursor-pointer">
                <summary className="font-semibold flex justify-between items-center group-open:text-[var(--lime)]">
                  {faq.q}
                  <span className="text-lg">+</span>
                </summary>
                <p className="text-[var(--text-2)] mt-4 text-sm">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* === FINAL CTA === */}
      <FinalCTA
        title="Ready to run on autopilot?"
        subtitle="50+ D2C brands are. Join this month and get your first month 30% off."
      />

      {/* === FOOTER === */}
      <Footer />
    </>
  )
}
