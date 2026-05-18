"use client"

import React from "react"
import { motion } from "framer-motion"
import { TopNav } from "@/components/chrome/TopNav"
import { Footer } from "@/components/chrome/Footer"
import { Button } from "@/components/ui/Button"
import { Card } from "@/components/ui/Card"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { Chip } from "@/components/ui/Chip"
import { FinalCTA } from "@/components/sections/FinalCTA"
import { Sparkles, Zap, Brain, TrendingUp, BarChart3, Wallet, MessageCircle, Truck } from "lucide-react"

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export default function Home() {
  return (
    <>
      <TopNav active="/" />

      {/* === HERO SECTION === */}
      <section
        className="pb-section-large relative overflow-hidden"
        style={{ marginTop: "var(--topbar-h)", paddingTop: "var(--s-10)" }}
      >
        {/* Animated gradient background */}
        <div
          className="absolute inset-0 pb-gradient-animated opacity-30"
          style={{
            background: "var(--gradient-hero)",
          }}
        />

        {/* Floating orbs */}
        <motion.div
          className="absolute top-20 right-10 w-72 h-72 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(38, 150, 176, 0.3) 0%, transparent 70%)",
          }}
          animate={{ y: [0, -30, 0], x: [0, 20, 0] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-20 left-10 w-96 h-96 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(220, 239, 138, 0.2) 0%, transparent 70%)",
          }}
          animate={{ y: [0, 30, 0], x: [0, -20, 0] }}
          transition={{ duration: 6, repeat: Infinity, delay: 0.5 }}
        />

        <motion.div
          className="pb-container relative z-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="max-w-3xl">
            <motion.div variants={itemVariants}>
              <Eyebrow>⌥ Autonomy meets insight</Eyebrow>
            </motion.div>

            <motion.h1
              className="pb-h1 mb-6 bg-clip-text text-transparent pb-gradient-animated"
              style={{ backgroundSize: "200% 200%" }}
              variants={itemVariants}
            >
              The AI operations team your D2C brand can't afford to hire.
            </motion.h1>

            <motion.p className="pb-lead text-[var(--text-2)] mb-8" variants={itemVariants}>
              Pulseback runs in the background of your Shopify store. It autonomously handles checkout scoring,
              customer support, returns logistics, retention campaigns, analytics, inventory, and financial
              reconciliation — all personalized to your customers' behavior, all learning and compounding every day.
            </motion.p>

            <motion.div className="flex gap-4 flex-wrap" variants={itemVariants}>
              <Button variant="primary" size="lg" href="/contact">
                Book a demo →
              </Button>
              <Button variant="secondary" size="lg" href="/how-it-works">
                Learn how it works
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* === THE 7 DOMAIN AGENTS === */}
      <section className="pb-section bg-gradient-to-b from-[var(--soft)] to-[var(--paper)]">
        <div className="pb-container">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Eyebrow>◇ The seven operating systems</Eyebrow>
            <h2 className="pb-h2">One AI. Seven workflows. Complete autonomy.</h2>
            <p className="text-[var(--text-2)] max-w-2xl mx-auto mt-4">
              Each domain agent owns its workflow. Together, they orchestrate your entire business.
            </p>
          </motion.div>

          <motion.div
            className="pb-grid-3"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              {
                icon: <Zap className="w-6 h-6" />,
                title: "Checkout OS",
                color: "blue",
                description: "RTO scoring, pincode intelligence, COD blocking, payment optimization",
                gradient: "from-blue-400 to-blue-600"
              },
              {
                icon: <MessageCircle className="w-6 h-6" />,
                title: "WhatsApp Agent OS",
                color: "green",
                description: "Multilingual support, intent classification, personalized responses, proactive help",
                gradient: "from-green-400 to-green-600"
              },
              {
                icon: <Truck className="w-6 h-6" />,
                title: "NDR OS",
                color: "cyan",
                description: "Shipment triage, address correction, reverse pickup, RTO management",
                gradient: "from-cyan-400 to-cyan-600"
              },
              {
                icon: <Brain className="w-6 h-6" />,
                title: "Retention OS",
                color: "purple",
                description: "Churn prediction, segment-specific campaigns, win-back offers, lifecycle intelligence",
                gradient: "from-purple-400 to-purple-600"
              },
              {
                icon: <BarChart3 className="w-6 h-6" />,
                title: "Analytics OS",
                color: "lime",
                description: "Conversational queries, cohort analysis, weekly pattern discovery, anomaly alerts",
                gradient: "from-lime-400 to-lime-600"
              },
              {
                icon: <Wallet className="w-6 h-6" />,
                title: "Finance OS",
                color: "blue",
                description: "COD float tracking, true ROAS, cash flow forecasts, reconciliation",
                gradient: "from-amber-400 to-orange-600"
              },
            ].map((os, idx) => (
              <motion.div
                key={os.title}
                variants={itemVariants}
                whileHover={{
                  y: -8,
                  boxShadow: "0 30px 60px rgba(11, 31, 26, 0.2)"
                }}
              >
                <Card padding="feature" hover className="flex flex-col h-full pb-3d-card group relative overflow-hidden">
                  {/* Gradient background effect */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${os.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

                  {/* Icon with gradient */}
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${os.gradient} p-2 text-white mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    {os.icon}
                  </div>

                  <h3 className="font-bold text-lg mb-2">{os.title}</h3>
                  <p className="text-[var(--text-3)] text-sm flex-1">{os.description}</p>
                  <Chip color={os.color as any} className="mt-4 w-fit">
                    {os.title.replace(" OS", "")}
                  </Chip>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === 3-PHASE SYSTEM === */}
      <section className="pb-section bg-gradient-to-b from-[var(--paper)] to-[var(--soft)]">
        <div className="pb-container">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Eyebrow>⚙ The three-phase system</Eyebrow>
            <h2 className="pb-h2">Connect → Learn → Automate</h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              {
                phase: "1",
                title: "Connect",
                description: "Install on your Shopify store. We read your order history, shipments, and customer behavior.",
                color: "from-blue-500 to-blue-600",
                number: "1"
              },
              {
                phase: "2",
                title: "Learn",
                description: "Agents observe patterns over 14 days. RTO model trains. Personalization kicks in.",
                color: "from-purple-500 to-purple-600",
                number: "2"
              },
              {
                phase: "3",
                title: "Automate",
                description: "Day 15+, agents make every decision. Checkout scoring, support, returns, marketing — all autonomous.",
                color: "from-lime-500 to-lime-600",
                number: "3"
              },
            ].map((phase) => (
              <motion.div
                key={phase.phase}
                variants={itemVariants}
                className="relative group"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${phase.color} rounded-2xl opacity-0 group-hover:opacity-10 blur-xl transition-all duration-300`} />

                <div className="relative bg-white border-2 border-[var(--line)] rounded-2xl p-8 group-hover:border-[var(--lime)] transition-all duration-300 pb-3d-card">
                  <motion.div
                    className={`w-16 h-16 rounded-xl bg-gradient-to-br ${phase.color} text-white flex items-center justify-center text-3xl font-bold mb-6`}
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    {phase.number}
                  </motion.div>

                  <h3 className="text-2xl font-bold mb-3 text-[var(--forest)]">{phase.title}</h3>
                  <p className="text-[var(--text-2)]">{phase.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === BEFORE/AFTER TRANSFORMATION === */}
      <section className="pb-section bg-gradient-to-b from-[var(--soft)] to-[var(--paper)]">
        <div className="pb-container">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Eyebrow>✦ The transformation</Eyebrow>
            <h2 className="pb-h2">From manual. To autonomous.</h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div
              variants={itemVariants}
              className="pb-3d-card p-8 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200"
            >
              <h3 className="text-xl font-bold mb-6 text-red-900">❌ Today (without Pulseback)</h3>
              <ul className="space-y-3">
                {[
                  "Abandoned carts ignored — manual followups",
                  "Support tickets pile up — customers wait",
                  "RTOs spike — no predictive scoring",
                  "Marketing blasts → low conversion",
                  "Returns chaos — manual approvals",
                  "Finance confused — no COD float tracking",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-red-800">
                    <span className="line-through opacity-50 flex-1">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="pb-3d-card p-8 rounded-2xl bg-gradient-to-br from-green-50 to-green-100 border border-green-200"
            >
              <h3 className="text-xl font-bold mb-6 text-green-900">✅ With Pulseback</h3>
              <ul className="space-y-3">
                {[
                  "Touch 1/2/3 auto-sent → 35% recovered",
                  "WISMO resolved in seconds → 0 tickets",
                  "RTO predicted + blocked → 8.3x reduction",
                  "Personalized offers → 3x higher conversion",
                  "Returns approved automatically → 48h fulfillment",
                  "COD float tracked → ₹4.2L working capital freed",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-green-800">
                    <span className="font-semibold flex-1">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* === SOCIAL PROOF === */}
      <section className="pb-section bg-gradient-to-b from-[var(--paper)] to-[var(--canvas)]">
        <div className="pb-container">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Eyebrow>📊 Real results</Eyebrow>
            <h2 className="pb-h2">Trusted by 100+ D2C brands</h2>
          </motion.div>

          <motion.div
            className="pb-grid-3"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              { metric: "8.3x", label: "RTO Reduction", icon: "📉" },
              { metric: "₹4.2L", label: "COD Float Freed", icon: "💰" },
              { metric: "96%", label: "Autonomous Resolution", icon: "🤖" },
              { metric: "3.2x", label: "Conversion Lift", icon: "📈" },
              { metric: "48h", label: "Return Fulfillment", icon: "📦" },
              { metric: "100+", label: "D2C Brands Using", icon: "🌍" },
            ].map((stat) => (
              <motion.div
                key={stat.metric}
                variants={itemVariants}
                whileHover={{ y: -8 }}
              >
                <Card padding="feature" className="text-center pb-3d-card relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-lime-400 to-blue-400 opacity-0 group-hover:opacity-5 rounded-2xl" />

                  <div className="text-5xl mb-4">{stat.icon}</div>
                  <div className="text-4xl font-bold mb-2 text-transparent bg-clip-text pb-gradient-animated" style={{ backgroundSize: "200% 200%" }}>
                    {stat.metric}
                  </div>
                  <p className="text-[var(--text-2)]">{stat.label}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === PRICING === */}
      <section className="pb-section bg-gradient-to-b from-[var(--canvas)] to-[var(--soft)]">
        <div className="pb-container">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Eyebrow>💳 Transparent pricing</Eyebrow>
            <h2 className="pb-h2">Built for brands at every scale</h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              { tier: "Starter", price: "₹29,999", volume: "0-100K monthly orders", features: ["Checkout OS", "WhatsApp Agent", "Basic analytics"] },
              { tier: "Growth", price: "₹79,999", volume: "100K-500K monthly orders", features: ["All Starter", "+ NDR OS", "+ Retention", "+ Finance"] },
              { tier: "Enterprise", price: "Custom", volume: "500K+ monthly orders", features: ["All Growth", "Dedicated support", "Custom agents"] },
            ].map((plan) => (
              <motion.div
                key={plan.tier}
                variants={itemVariants}
                whileHover={{ y: -12 }}
                className={plan.tier === "Growth" ? "md:scale-105" : ""}
              >
                <Card padding="feature" className="h-full pb-3d-card flex flex-col">
                  <h3 className="text-2xl font-bold mb-2">{plan.tier}</h3>
                  <div className="text-4xl font-bold text-transparent bg-clip-text pb-gradient-animated mb-2" style={{ backgroundSize: "200% 200%" }}>
                    {plan.price}
                  </div>
                  <p className="text-[var(--text-3)] text-sm mb-6">{plan.volume}</p>
                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-[var(--text-2)]">
                        <span className="text-[var(--lime)]">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button variant="primary" size="md" href="/contact" className="w-full">
                    Get started
                  </Button>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === CTA === */}
      <FinalCTA />

      {/* === FOOTER === */}
      <Footer />
    </>
  )
}
