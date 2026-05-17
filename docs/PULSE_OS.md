# PulseOS — Master Reference
> Single source of truth. Only update on explicit instruction.
> Last updated: 2026-05-15 (v3)

---

## SESSION QUICK-START

**Read these first when resuming any session:**
1. This file (context restore — architecture, built status, next tasks)
2. Specific file being edited (never from memory — always re-read before touching)
3. Schema if touching DB: `packages/database/prisma/schema.prisma`

**Run before any DB change:**
```bash
DIRECT_URL="postgresql://postgres.qlewszzlsqoxlqrqyrit:Allthewayup2025@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require" \
DATABASE_URL="postgresql://postgres.qlewszzlsqoxlqrqyrit:Allthewayup2025@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require" \
npx prisma db push --schema=packages/database/prisma/schema.prisma
```

**Typecheck before considering anything done:**
```bash
npx tsc --noEmit 2>&1 | grep -v "apps/marketing" | grep "error"
# apps/marketing errors are pre-existing Next.js config issues — ignore them
```

---

## WHAT PULSEOS IS

AI operating system for Indian D2C brands. Not a tool — a system.
Every brand touchpoint (checkout → order → shipping → support → retention → analytics)
runs through PulseOS. The AI layer connects them, finds causality, and acts.

**Deployed at:** pulseback.fly.dev
**Stack:** Remix + Vite → Fly.io | Postgres (Supabase, ap-south-1) | Redis (Upstash) | BullMQ
**Monorepo:** Turborepo — `apps/shopify`, `packages/core`, `packages/database`, `packages/shared`

---

## FILE REFERENCE MAP

The most important section for session efficiency. Every key file and what it does.

### apps/shopify/app/routes/

| File | Purpose | Status |
|---|---|---|
| `checkout.$shop.tsx` | Public branded checkout — OTP, RTO scoring, COD/prepaid, order placement | ✅ Built |
| `api.checkout.otp.tsx` | OTP send + verify — Postgres-backed, multi-instance safe | ✅ Built |
| `api.checkout.place.tsx` | Shopify Draft Orders API — creates order, links to CheckoutSession | ✅ Built |
| `api.whatsapp.webhook.tsx` | Inbound WhatsApp — session management, Haiku intent classification, routes to agent | ✅ Built |
| `webhooks.orders.create.tsx` | Thin enqueue only → `queue/webhook`, dedup via `X-Shopify-Webhook-Id` | ✅ Built |
| `webhooks.orders.updated.tsx` | Thin enqueue only → `queue/webhook`, handles dispatch + cancellation | ✅ Built |
| `webhooks.checkouts.create.tsx` | Thin enqueue only → `queue/webhook` | ✅ Built |
| `webhooks.checkouts.update.tsx` | Thin enqueue only → `queue/webhook` | ✅ Built |
| `webhooks.app.uninstalled.tsx` | Thin enqueue only → marks shop inactive | ✅ Built |
| `app.tsx` | Nav shell — Orders, Customers, Analytics, Automations, AI Chat, Settings | ✅ Built |
| `app._index.tsx` | Dashboard — briefing card, KPIs | ✅ Built |
| `app.orders.tsx` | Orders list + filters | ✅ Built |
| `app.customers.tsx` | Customer list, lifecycle, LTV | ✅ Built |
| `app.customers.$id.tsx` | Customer detail — timeline, orders, RTO history | ✅ Built |
| `app.analytics.tsx` | Analytics — KPIs, pincode heatmap, carrier perf, UTM attribution | ✅ Built |
| `app.automations.tsx` | Rules builder — trigger/condition/action | ✅ Built |
| `app.chat.tsx` | Merchant Intelligence Agent — Claude Sonnet on live data | ✅ Built |
| `app.settings.tsx` | Shop config — checkout branding, thresholds, integrations | ✅ Built |
| `app.ndr.tsx` | NDR dashboard — stuck shipments, attempt history, resolution rate | 🔨 Pending |
| `app.returns.tsx` | Merchant returns view | 🔨 Pending |
| `app.finance.tsx` | Finance OS — COD float, true ROAS, working capital | 🔨 Pending |
| `app.inventory.tsx` | Inventory OS — stockouts, RTO by SKU, dead stock | 🔨 Pending |
| `app.marketing.tsx` | Marketing OS — Meta CAPI, audience builder, broadcast | 🔨 Pending |
| `returns.$shop.tsx` | Public returns portal — OTP, eligible orders, photo, Shiprocket pickup | 🔨 Pending |

### packages/core/src/queue/

| File | Purpose | Status |
|---|---|---|
| `redis.ts` | `getRedis()` singleton + `createRedisConnection()` for workers | ✅ Built |
| `queues.ts` | 8 typed queues + helper fns: `queueCommunication`, `queueWebhook`, `queueTracking`, `queueNdr` | ✅ Built |
| `scheduler.ts` | `registerRepeatableJobs()` — all cron patterns (replaces cron-job.org) | ✅ Built |
| `index.ts` | Barrel export for all queue exports + worker start fns | ✅ Built |
| `workers/webhook.worker.ts` | Idempotent Shopify webhook processing — orders, checkouts, uninstall | ✅ Built |
| `workers/communication.worker.ts` | WhatsApp/SMS sends — priority, quiet hours, frequency cap, retry | ✅ Built |
| `workers/tracking.worker.ts` | Shiprocket polling, status normalization, stuck detection → triggers NDR | ✅ Built |
| `workers/ndr.worker.ts` | NDR sweep — escalating messages per attempt, cooldown logic | ✅ Built |
| `workers/abandoned.worker.ts` | Abandoned cart recovery | 🔨 Pending |
| `workers/retention.worker.ts` | Daily retention scoring + BG/NBD LTV | 🔨 Pending |
| `workers/winback.worker.ts` | Lapsed customer win-back | 🔨 Pending |
| `workers/briefing.worker.ts` | 9pm briefing agent — analytics synthesis | 🔨 Pending |

### packages/core/src/agents/

| File | Purpose | Status |
|---|---|---|
| `support-agent.ts` | Claude Sonnet with 5 tools: get_order_status, cancel_order, update_delivery_address, initiate_return, escalate_to_human | ✅ Built |
| `orchestrator.ts` | Multi-agent routing shell | ✅ Built |

### packages/core/src/communication/

| File | Purpose | Status |
|---|---|---|
| Gupshup router | Route outbound messages per shop's WABA | 🔨 Pending (currently uses AiSensy/WATI/Meta) |

### packages/database/prisma/

| File | Key models | Status |
|---|---|---|
| `schema.prisma` | All models — see Schema Reference below | ✅ Synced to Supabase |

### apps/shopify/worker/

| File | Purpose | Status |
|---|---|---|
| `index.ts` | Fly.io worker entry — starts 4 workers + registers schedules | ✅ Built |

---

## SCHEMA REFERENCE — KEY MODELS

Quick lookup for what's in the DB. Read full schema only when editing.

```
Shop               — one per merchant, holds all config + credentials
Customer           — shopId + phone/email, RTO score, LTV, lifecycle, churn score
Order              — shopId, customerId, Shopify order ID, status, paymentMethod, rtoRisk
Shipment           — orderId, AWB, carrier, status, isStuck, ndrAttempts, lastNdrAt
CheckoutSession    — shopId, token, cartValue, status (active/abandoned/completed), UTM
OtpCode            — shopId + phone (unique), code, expiresAt, used — for OTP auth
WhatsAppSession    — shopId + phone (unique), history JSON, currentIntent, expiresAt (24h)
Communication      — shopId, customerId, channel, direction, templateName, status
SupportTicket      — shopId, customerId, conversation JSON, status, escalatedAt
TimelineEvent      — customerId, shopId, eventType, title, metadata JSON
Automation         — shopId, trigger, conditions JSON, actions JSON, enabled
Return             — orderId, items JSON, reason, status, shipmentId
```

**Schema constraints to remember:**
- `Customer` unique: `shopId_phone` and `shopId_email`
- `Order` unique: `shopId_shopifyOrderId`
- `CheckoutSession` unique: `shopifyCheckoutToken` (single field, NOT composite)
- `OtpCode` unique: `shopId_phone`
- `WhatsAppSession` unique: `shopId_phone`

---

## THE QUEUES

```
Queue name      Concurrency   Schedule              Purpose
──────────────────────────────────────────────────────────────────
webhook         10            triggered             Shopify webhooks (priority 1)
communication   30            triggered             WhatsApp/SMS sends
tracking        5             */15 * * * *          Shiprocket status polling
ndr             3             0 * * * *             NDR sweep + triggered on stuck
abandoned       5             */5 * * * *           Abandoned cart recovery
retention       5             30 4 * * *  (10am IST) LTV scoring + at-risk comms
winback         3             30 5 * * *  (11am IST) Lapsed customer recovery
briefing        2             30 15 * * * (9pm IST)  Daily merchant briefing
```

**Job dedup pattern:**
- `webhook:` → `X-Shopify-Webhook-Id` header (Shopify's own dedup key)
- `comm:` → `shopId:customerId:triggerType:triggerRef`
- `track:awb:` → per-AWB dedup
- `ndr:` → per-shipment with timestamp (intentional — retries are fine)

---

## THE AGENT STACK

| Agent | Faces | Model | Tools |
|---|---|---|---|
| **Customer Agent** | Customer (WhatsApp) | Haiku (classify) → Sonnet (act) | cancel_order, update_delivery_address, initiate_return, get_order_status, escalate_to_human |
| **Merchant Intelligence** | Merchant (web chat) | Sonnet | query_db, update_settings, trigger_campaign |
| **Briefing Agent** | Merchant (9pm) | Sonnet | query_analytics, compare_periods, identify_anomalies |
| **Retention Agent** | Cron | Sonnet | score_customers, generate_message, add_to_queue |
| **NDR Agent** | Customer (outbound) | Haiku | schedule_reattempt, cancel_order |
| **Finance Agent** | Merchant (finance page) | Sonnet | query_orders, query_shipments, compute_metrics |
| **RTO Root Cause** | Analytics surface | Sonnet | classify_rto_reason, surface_recommendation |

**Model routing rule:**
- Haiku → all classification, bulk generation, anything > 100 calls/day
- Sonnet → response quality matters, tool use, reasoning, VIP customers
- Vision → return photos, product damage, carrier labels

---

## WHAT'S BUILT vs. PENDING

### ✅ Built (can be relied on)
- Checkout OS — branded, OTP, RTO scoring, COD/prepaid, freebies, Draft Orders
- OTP — Postgres-backed `OtpCode` table, multi-instance safe, replay-proof
- Webhook pipeline — 4 thin webhook routes → `queue/webhook` → `webhook.worker` (idempotent, deduped)
- BullMQ infrastructure — 8 queues, typed payloads, retry, backoff, scheduler
- `communication.worker` — priority, quiet hours (10pm-8am), frequency cap, retry ×3
- `tracking.worker` — Shiprocket polling, status normalization, stuck detection
- `ndr.worker` — escalating messages (3 attempts), 6h cooldown, triggers on stuck
- `scheduler.ts` — all 6 cron patterns registered
- `worker/index.ts` — Fly.io worker process (4 workers + schedules)
- Customer Agent — Haiku intent classification, WhatsAppSession multi-turn context, Sonnet tools
- `support-agent.ts` — 5 tools including `update_delivery_address`
- Dashboard, orders, customers, analytics, automations, AI chat, settings routes
- `fly.toml` — two-process setup (app 1GB + worker 512MB)
- Schema synced to Supabase via `prisma db push`

### 🔨 Pending (next to build)
1. **Razorpay** — prepaid payment in checkout (`key_id` + `key_secret` needed from user)
2. **`/app/ndr`** — merchant NDR dashboard (stuck shipments, attempt history, root cause)
3. **`/returns/:shop`** — public returns portal (OTP → eligible orders → photo → Shiprocket pickup)
4. **`/app/returns`** — merchant returns view
5. **`/app/finance`** — COD float, true ROAS, carrier true cost, working capital gauge
6. **`/app/inventory`** — stockout alerts, RTO by SKU, dead stock
7. **`/app/marketing`** — Meta CAPI, audience builder, broadcast composer
8. `abandoned.worker` — cart recovery sweep
9. `retention.worker` — daily LTV scoring + at-risk comms
10. `winback.worker` — lapsed customer recovery
11. `briefing.worker` — 9pm synthesis + WhatsApp delivery
12. Gupshup integration — replace AiSensy/WATI (pending partner approval)
13. Shiprocket token auto-refresh (expires every 10d)
14. FastText language detection (npm install + wire into webhook)
15. DPDP consent checkbox at checkout

### 📐 When Data Warrants
- BG/NBD LTV prediction (need 30d+ history)
- Prophet demand forecasting (need Inventory OS first)
- XGBoost RTO model (need 10k+ labeled orders)
- Isolation Forest fraud (need 1k+ orders)
- pgvector semantic search (enable Supabase extension when Support OS built)
- Voice escalation — ElevenLabs + Retell (when NDR data justifies it)

---

## DEPLOYMENT BLOCKERS — STATUS

| # | Blocker | Severity | Status |
|---|---|---|---|
| 1 | OTP in-memory Map | 🔴 Broken multi-machine | ✅ Fixed — Postgres OtpCode |
| 2 | BullMQ reliability | 🟡 No retry, no dedup | ✅ Fixed — full infra + scheduler |
| 3 | Webhook idempotency | 🟡 Double-processing | ✅ Fixed — webhook.worker + jobId dedup |
| 4 | WhatsApp session state | 🟡 Agent can't multi-turn | ✅ Fixed — WhatsAppSession table |
| 5 | **REDIS_URL missing** | 🔴 Worker won't start | ⚠️ BLOCKED — user needs Upstash Redis URL |
| 6 | Razorpay integration | 🔴 No prepaid path | 🔨 Pending — needs key_id + key_secret |
| 7 | Shiprocket token refresh | 🟡 Silent failure at 10d | 🔨 Pending — add shiprocketTokenExpiresAt to Shop |
| 8 | LLM action guardrails | 🟡 Wrong action = disaster | 🔨 Pending — confirm-before-execute in Agent |
| 9 | Shopify checkout extensibility | 🟠 Theme ext fragile long-term | 📐 Planned — Plus strategy + Checkout UI Extensions |
| 10 | DPDP consent | 🟠 Legal risk India | 🔨 Pending — consent checkbox at checkout |

---

## CREDENTIALS NEEDED

### Unblocks active build right now
| Credential | Where to get | Used for |
|---|---|---|
| `REDIS_URL` (Upstash) | upstash.com → create Redis DB | BullMQ — workers won't start without this |
| Razorpay `key_id` + `key_secret` | razorpay.com → Settings → API Keys | Prepaid payment in checkout |

### Before first merchant onboards
| Credential | Where to get | Used for |
|---|---|---|
| Gupshup ISV Partner account | partners.gupshup.io | WhatsApp + SMS infra for all brands |
| Meta Business Account (verified) | business.facebook.com | Embedded Signup for merchant WABA |
| DLT registration (TRAI) | Any telecom operator portal | SMS sender ID — mandatory in India |
| Shiprocket credentials | shiprocket.in → Settings → API | Tracking, NDR, reverse pickups |

### Already have
| Credential | Status |
|---|---|
| `ANTHROPIC_API_KEY` | ✅ Have — all LLM calls |
| `DATABASE_URL` + `DIRECT_URL` | ✅ Have — Supabase Postgres |
| Shopify Partner account | ✅ Have — app deployed |

### Before app store listing
| Credential | Where to get |
|---|---|
| Razorpay live keys (after KYC) | razorpay.com |
| GST registration | Government portal |
| Gupshup Partner API key | After ISV approval |

---

## INFRASTRUCTURE

```
COMPUTE
  Fly.io — primary_region: bom (Mumbai)
    app process    → Remix server (1GB) — handles all HTTP
    worker process → BullMQ workers (512MB) — handles all async
    fly.toml: app = "node build/server/index.js"
              worker = "node build/worker/index.js"

DATABASE
  Postgres (Supabase, ap-south-1)
    DATABASE_URL → pooled (pgBouncer, port 6543) — app server
    DIRECT_URL   → direct (port 5432) — prisma db push only
    Use: prisma db push (never prisma migrate dev — non-interactive env)

QUEUE + CACHE
  Redis (Upstash) → REDIS_URL (env var, set as Fly secret)
  BullMQ worker entry: apps/shopify/worker/index.ts

COMMUNICATIONS
  Current:  AiSensy / WATI / Meta Cloud API (per merchant credentials)
  Planned:  Gupshup Partner API (ISV model — brand's own WABA, invisible Pulseback)
  Fallback: Twilio SMS
  All flows through: packages/core/queue/workers/communication.worker.ts
```

---

## THE CORE LOOP — PULSEOS WORKFLOW

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHECKOUT OS  [/checkout/:shop — public, branded]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phone OTP → Address autofill → RTO score computed
  score > Shop.rtoThreshold → COD hidden
  COD shown → optional deposit (Shop.codDepositPct)
  Prepaid → Razorpay SDK
  Order placed → Draft Orders API → CheckoutSession saved + UTM


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDER OS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Shopify webhook → queue/webhook (jobId = Shopify-Webhook-Id)
  └── webhook.worker (idempotent):
        Customer upsert → Order upsert → Customer stats updated
        [PREPAID] → queue/communication: order_confirmed (HIGH)
        [COD]     → queue/communication: cod_confirmation (HIGH)
                    → Customer Agent handles reply:
                          "yes/haan" → confirmed
                          "no/nahi"  → cancelled via Shopify
        [COD risk > 40] → prepaid nudge + Razorpay link

orders/updated webhook:
  dispatched → Shipment created → queue/communication: order_dispatched
  cancelled  → Order.status updated + timeline


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHIPPING OS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
queue/tracking (every 15min, batch 200 shipments):
  Shiprocket API → normalize status
  delivered      → Order.delivered, Customer.lastSeenAt updated
  rto_initiated  → Order.isRTO=true, Customer.rtoRiskScore += 10
  no movement 48h → isStuck=true → immediate job to queue/ndr


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NDR OS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
queue/ndr (hourly sweep + triggered on stuck):
  Find: isStuck=true, ndrAttempts < 3, lastNdrAt > 6h ago
  attempt 1 → friendly: "Hi Priya, your order is nearby..."
  attempt 2 → urgency: "48h or it returns..."
  attempt 3 → final + voice escalation (ElevenLabs + Retell)
  Customer replies via WhatsApp → Customer Agent acts
  /app/ndr → merchant dashboard (pending)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHATSAPP AGENT OS  [api.whatsapp.webhook.tsx]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Identify customer by phone → load profile
2. Load WhatsAppSession (24h TTL, multi-turn context)
3. Claude Haiku → classify intent (cheap, fast):
     cod_confirm | cod_cancel | wismo | cancel_order
     return_request | address_update | support
4. Fast path: cod_confirm/cancel and wismo → direct handler
5. Complex path → support-agent.ts (Sonnet + tools):
     get_order_status | cancel_order | update_delivery_address
     initiate_return  | escalate_to_human
6. Session updated → reply sent via queue/communication


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RETENTION OS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
queue/retention (daily 10am IST):
  BG/NBD → predictive LTV, expectedNextOrderAt
  avgGap × 1.2 breach → at_risk flag
  Negative retention: rtoAdjustedLTV < 0 → suppress from ALL campaigns
  Rules engine (/app/automations) → merchant-defined trigger/condition/action
  Retention Agent (Sonnet) → personalized message per customer
queue/winback (daily 11am IST): lapsed 90d+ → personalized recovery


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYTICS OS  [/app/analytics]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KPIs | Pincode RTO heatmap | Carrier performance
UTM attribution + true ROAS | RTO root cause breakdown
queue/briefing (9pm IST):
  Sonnet synthesizes day's data → narrative + 3 actions
  → WhatsApp voice note + dashboard card


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINANCE OS  [/app/finance — pending]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COD float map (in transit → arriving today/this week/at risk)
True ROAS per UTM (gross vs RTO-adjusted)
Carrier true cost (shipping + RTO cost per delivered order)
Working capital gauge
Finance Agent: narrative paragraph ("₹31L locked in Delhivery routes...")
```

---

## MODEL STACK — QUICK REFERENCE

```
Task                              Model                 Cost
───────────────────────────────────────────────────────────────────
Intent classification (WhatsApp)  Claude Haiku          Very cheap
NDR message generation            Claude Haiku          Very cheap
Bulk segment scoring              Claude Haiku          Very cheap
Customer agent response           Claude Sonnet         Medium
Merchant chat / briefing          Claude Sonnet         Medium
Personalized retention messages   Claude Sonnet         Medium
Return photo classification       Claude Sonnet Vision  Medium
Language detection                FastText (local)      FREE
Sentiment analysis                HuggingFace           FREE (tier)
Predictive LTV                    BG/NBD (lifetimes)    FREE
Demand forecasting                Prophet               FREE
Fraud detection                   Isolation Forest      FREE
RTO scoring                       XGBoost → rules       FREE
STT (voice messages)              Deepgram / Sarvam     $0.006/min
Voice synthesis (briefing)        ElevenLabs            $0.30/1k chars
AI voice calls (NDR escalation)   Retell / Bland        $0.07-0.15/min
Indian language generation        Sarvam AI             Indian pricing
```

**Model routing rule — always:**
> Haiku for classification (12× cheaper). Sonnet only when quality matters or tools needed.
> Never use Opus. Never fine-tune. Never run your own embedding model.

---

## WHATSAPP ARCHITECTURE

```
Pulseback Partner Account (Gupshup ISV — pending approval)
  ├── Brand A WABA → their number, their name, their templates
  ├── Brand B WABA → fully independent identity
  └── N brands → Pulseback invisible to customers

Revenue: Gupshup charges ~₹0.35-0.58/conversation
         Pulseback marks up + bills merchant
         WhatsApp = second revenue stream alongside SaaS fee

Current (before Gupshup approved):
  → AiSensy / WATI / Meta Cloud API per merchant's own credentials
```

---

## PER-MERCHANT ECONOMICS

```
500 orders/month:

LLM (Haiku classify + Sonnet generate)   ~₹1,000/month
Infrastructure (Fly + Redis + DB share)  ~₹200/month
Voice escalation (~15 NDR calls)         ~₹200/month
Embeddings + STT                         ~₹100/month
Statistical/classical ML                 ₹0 (free)
──────────────────────────────────────────────────────
Total cost                               ~₹1,500/month
Charge merchants                         ₹5,000–15,000/month
Gross margin                             70–85%
```

---

## COMPETITIVE POSITIONING

**The structural gap nobody owns:**
GoKwik sees checkout. ClickPost sees shipments. AiSensy sees WhatsApp sends.
None of them see the full customer thread.

PulseOS connects:
`UTM source → checkout behaviour → RTO score → COD reply → delivery → NDR → repurchase → engagement history`

**Non-negotiables per OS:**
- Checkout: brand's own colors/logo/name on WhatsApp OTP (never "Pulseback")
- RTO: root cause classification, not just score — fix upstream not just block
- WhatsApp Agent: takes real actions — cancel, address change, return, reattempt
- Briefing: arrives at 9pm, voice note, 3 specific actions for tomorrow
- Finance: visual — gauge + map, not tables; narrative paragraph from AI
- Retention: negative retention filter before every campaign (LTV < 0 = suppress)

**The compounding moat:**
Every brand onboarded adds cross-merchant data — pincode RTO rates, fraud patterns, carrier benchmarks.
50 brands = a dataset GoKwik has and nobody else does.

---

*Updated only on explicit instruction. v3 — 2026-05-15*
