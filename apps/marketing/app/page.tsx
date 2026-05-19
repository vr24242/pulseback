"use client"

import React from "react"
import { motion } from "framer-motion"
import { TopNav } from "@/components/chrome/TopNav"
import { Footer } from "@/components/chrome/Footer"
import { Button } from "@/components/ui/Button"
import { Card } from "@/components/ui/Card"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { Chip } from "@/components/ui/Chip"

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
}

// Abstract shape components
const ShapeCircle = ({ className = "" }) => (
  <div className={`absolute rounded-full ${className}`} />
)

const ShapeGradient = ({ className = "" }) => (
  <div className={`absolute blur-3xl ${className}`} />
)

export default function Home() {
  return (
    <>
      <TopNav active="/" />

      {/* === HERO SECTION === */}
      <section
        className="relative overflow-hidden"
        style={{ marginTop: "var(--topbar-h)", paddingTop: "120px", paddingBottom: "80px" }}
      >
        {/* Abstract shapes */}
        <ShapeGradient className="top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-blue-400/20 to-purple-400/10 -translate-y-1/2 translate-x-1/3" />
        <ShapeGradient className="bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-lime-400/15 to-blue-400/5 translate-y-1/2 -translate-x-1/4" />

        <motion.div
          className="pb-container relative z-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="max-w-4xl">
            <motion.div variants={itemVariants} className="mb-8">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200/50">
                <span className="text-sm font-medium text-blue-900">The Operating System for D2C</span>
              </div>
            </motion.div>

            <motion.h1
              className="text-6xl md:text-7xl font-display font-bold mb-8 leading-tight text-[var(--forest)]"
              variants={itemVariants}
            >
              Ship operations, not support tickets.
            </motion.h1>

            <motion.p
              className="text-2xl text-[var(--text-2)] mb-12 leading-relaxed max-w-2xl"
              variants={itemVariants}
            >
              Pulseback replaces six tools with a single intelligent operating system that learns your business, automates your workflows, and compounds your growth every single day.
            </motion.p>

            <motion.div className="flex gap-6 flex-wrap" variants={itemVariants}>
              <Button variant="primary" size="lg" href="/contact">
                Request a demo
              </Button>
              <Button variant="secondary" size="lg" href="/how-it-works">
                Learn more
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* === THE AGENTS === */}
      <section className="relative py-32 bg-gradient-to-b from-transparent via-blue-50/30 to-transparent">
        <ShapeGradient className="absolute top-1/4 right-10 w-96 h-96 bg-gradient-to-bl from-purple-300/10 to-transparent blur-3xl" />

        <div className="pb-container relative z-10">
          <motion.div
            className="text-center mb-24"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-5xl md:text-6xl font-display font-bold text-[var(--forest)] mb-6">
              Seven AI agents. One operating system.
            </h2>
            <p className="text-xl text-[var(--text-2)] max-w-3xl mx-auto">
              Every aspect of your business runs on specialized intelligence that learns, improves, and compounds.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {[
              {
                title: "Checkout",
                description: "Intelligent order qualification. Real-time RTO scoring. Dynamic payment routing.",
                accent: "from-blue-500 to-blue-600",
              },
              {
                title: "Support",
                description: "Every WISMO resolved in seconds. Multilingual understanding. Proactive assistance.",
                accent: "from-emerald-500 to-emerald-600",
              },
              {
                title: "Logistics",
                description: "Shipment triage at scale. Automated NDR handling. Reverse logistics orchestration.",
                accent: "from-cyan-500 to-cyan-600",
              },
              {
                title: "Retention",
                description: "Lifecycle intelligence built in. Segment-specific messaging. Win-back automation.",
                accent: "from-purple-500 to-purple-600",
              },
              {
                title: "Analytics",
                description: "Conversational business insights. Cohort analysis. Weekly pattern discovery.",
                accent: "from-amber-500 to-amber-600",
              },
              {
                title: "Finance",
                description: "Real-time COD float tracking. True ROAS measurement. Automated reconciliation.",
                accent: "from-rose-500 to-rose-600",
              },
            ].map((agent, idx) => (
              <motion.div
                key={agent.title}
                variants={itemVariants}
                whileHover={{
                  y: -12,
                  transition: { duration: 0.3 }
                }}
              >
                <div className="group h-full">
                  {/* Gradient accent line */}
                  <div className={`h-1 w-12 bg-gradient-to-r ${agent.accent} rounded-full mb-6 group-hover:w-16 transition-all duration-300`} />

                  <h3 className="text-2xl font-bold text-[var(--forest)] mb-3">{agent.title}</h3>
                  <p className="text-lg text-[var(--text-2)] leading-relaxed">{agent.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === HOW IT WORKS === */}
      <section className="py-32 bg-white">
        <div className="pb-container">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-5xl md:text-6xl font-display font-bold text-[var(--forest)] mb-6">
              Three phases to full autonomy.
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-12"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {[
              {
                number: "01",
                title: "Connect",
                timeline: "Day 1",
                description: "Install on Shopify. We ingest your order history, shipment data, and customer interactions. Your business becomes legible to AI.",
              },
              {
                number: "02",
                title: "Learn",
                timeline: "Days 2-14",
                description: "Agents observe patterns. RTO model trains on your shipping corridors. Personalization models compile. The system builds context.",
              },
              {
                number: "03",
                title: "Automate",
                timeline: "Day 15+",
                description: "Every decision flows through AI. Checkout scoring, support responses, return approvals, marketing sends. Full operational autonomy.",
              },
            ].map((phase, idx) => (
              <motion.div key={phase.number} variants={itemVariants}>
                <div className="relative">
                  {/* Connection line */}
                  {idx < 2 && (
                    <div className="hidden md:block absolute top-24 -right-6 w-12 h-1 bg-gradient-to-r from-blue-400 to-transparent" />
                  )}

                  <div className="mb-8">
                    <div className="text-7xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500">
                      {phase.number}
                    </div>
                  </div>

                  <div className="inline-block px-3 py-1 rounded-full bg-blue-50 border border-blue-200/50 mb-4">
                    <span className="text-sm font-medium text-blue-900">{phase.timeline}</span>
                  </div>

                  <h3 className="text-3xl font-bold text-[var(--forest)] mb-4">{phase.title}</h3>
                  <p className="text-lg text-[var(--text-2)] leading-relaxed">{phase.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === TRANSFORMATION === */}
      <section className="py-32 bg-gradient-to-b from-blue-50/50 to-white">
        <div className="pb-container">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-5xl md:text-6xl font-display font-bold text-[var(--forest)] mb-6">
              From manual operations to intelligent systems.
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 lg:grid-cols-2 gap-12"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            <motion.div
              variants={itemVariants}
              className="space-y-6 p-12 rounded-2xl bg-gradient-to-br from-red-50 to-red-50/50 border border-red-200/30"
            >
              <h3 className="text-2xl font-bold text-red-900 mb-8">Without Pulseback</h3>
              <ul className="space-y-4">
                {[
                  "Abandoned carts missed — manual follow-ups fail to convert",
                  "Support tickets pile up — customers wait hours for answers",
                  "RTO rates spike — no predictive scoring to prevent losses",
                  "Marketing broadcasts underperform — one-size-fits-all messaging",
                  "Returns backlog grows — manual approvals take weeks",
                  "Finance operates blind — COD float tracking in spreadsheets",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-red-800">
                    <span className="text-red-400 font-bold">−</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="space-y-6 p-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-50/50 border border-emerald-200/30"
            >
              <h3 className="text-2xl font-bold text-emerald-900 mb-8">With Pulseback</h3>
              <ul className="space-y-4">
                {[
                  "35% cart recovery rate — touches 1-3 auto-send based on behavior",
                  "WISMO resolved in seconds — 96% autonomous without escalation",
                  "8.3x RTO reduction — intelligent scoring blocks high-risk orders",
                  "3.2x higher conversion — personalized offers reach right customers",
                  "Returns handled in 48 hours — auto-approve, auto-pickup scheduled",
                  "₹4.2L working capital freed — real-time COD tracking by corridor",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-emerald-800">
                    <span className="text-emerald-500 font-bold">+</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* === METRICS === */}
      <section className="py-32 bg-white">
        <div className="pb-container">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-5xl md:text-6xl font-display font-bold text-[var(--forest)]">
              Proven at scale.
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {[
              { number: "8.3x", label: "RTO Reduction", context: "Across 100+ merchants" },
              { number: "₹4.2L", label: "COD Float Freed", context: "Per merchant, annually" },
              { number: "96%", label: "Autonomous", context: "Customer issues resolved by AI" },
            ].map((metric) => (
              <motion.div
                key={metric.number}
                variants={itemVariants}
                className="text-center p-8"
              >
                <div className="text-6xl md:text-7xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 mb-3">
                  {metric.number}
                </div>
                <p className="text-xl font-bold text-[var(--forest)] mb-2">{metric.label}</p>
                <p className="text-[var(--text-3)]">{metric.context}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === PRICING === */}
      <section className="py-32 bg-gradient-to-b from-blue-50/50 to-white">
        <div className="pb-container">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-5xl md:text-6xl font-display font-bold text-[var(--forest)] mb-4">
              Transparent pricing.
            </h2>
            <p className="text-xl text-[var(--text-2)]">Scale from startup to enterprise.</p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {[
              {
                tier: "Starter",
                price: "₹29,999",
                volume: "0 to 100K orders/month",
                features: ["Checkout OS", "Support Agent", "Basic analytics"],
              },
              {
                tier: "Growth",
                price: "₹79,999",
                volume: "100K to 500K orders/month",
                features: ["Everything in Starter", "Logistics Agent", "Retention Agent", "Finance Agent"],
              },
              {
                tier: "Enterprise",
                price: "Custom",
                volume: "500K+ orders/month",
                features: ["All agents fully customized", "Dedicated support", "Custom integrations"],
              },
            ].map((plan, idx) => (
              <motion.div key={plan.tier} variants={itemVariants}>
                <div className={`p-10 rounded-2xl border transition-all duration-300 h-full flex flex-col ${
                  idx === 1
                    ? "border-blue-300 bg-gradient-to-br from-blue-50 to-white ring-2 ring-blue-100"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}>
                  <h3 className="text-2xl font-bold text-[var(--forest)] mb-2">{plan.tier}</h3>
                  <p className="text-[var(--text-3)] mb-6">{plan.volume}</p>

                  <div className="mb-8">
                    <div className="text-4xl font-display font-bold text-[var(--forest)]">{plan.price}</div>
                    <p className="text-[var(--text-3)] text-sm mt-1">Per month, billed annually</p>
                  </div>

                  <ul className="space-y-4 flex-1 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-[var(--text-2)]">
                        <span className="text-blue-500 font-bold mt-0.5">▪</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={idx === 1 ? "primary" : "secondary"}
                    size="md"
                    href="/contact"
                    className="w-full"
                  >
                    Get started
                  </Button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === FINAL CTA === */}
      <section className="py-32 bg-gradient-to-r from-blue-900 via-purple-900 to-blue-900 relative overflow-hidden">
        <ShapeGradient className="absolute inset-0 opacity-30 blur-3xl" />

        <motion.div
          className="pb-container relative z-10 text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="text-5xl md:text-6xl font-display font-bold text-white mb-6">
            Ready to automate your operations?
          </h2>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-12">
            Join 100+ D2C brands running their business on Pulseback.
          </p>
          <div className="flex gap-6 justify-center flex-wrap">
            <Button variant="primary" size="lg" href="/contact">
              Request a demo
            </Button>
            <Button variant="secondary" size="lg" href="/docs">
              Read the docs
            </Button>
          </div>
        </motion.div>
      </section>

      {/* === FOOTER === */}
      <Footer />
    </>
  )
}
