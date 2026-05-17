# PulseOS — Master Context
> Auto-loaded every session. This is the single source of truth.

---

## The Vision

PulseOS is not a dashboard. It is an **autonomous operating system for D2C commerce**.

D2C today is humans doing repetitive, time-sensitive work:
- Merchant sees abandoned cart → manually sends discount
- Support agent answers "where is my order" → looks up tracking → replies
- Ops team checks Shiprocket → calls courier → updates customer
- Finance team pulls data → calculates COD float in spreadsheets
- Marketing manager segments → writes templates → schedules blasts

PulseOS eliminates every one of these loops.

```
Real-world event (order / cart / shipment / message / payment)
    ↓
Webhook → thin enqueue (< 50ms, never drop, never block)
    ↓
BullMQ worker dequeues → calls Agent Layer with full customer context
    ↓
Agent decides: act / wait / escalate / silence
    ↓
Action taken (WA sent, COD blocked, pickup scheduled, merchant alerted)
    ↓
Outcome tracked → feeds back into customer model
    ↓
Next decision is smarter
```

**The merchant's job shifts: operator → approver.**
Agents execute. Merchants set thresholds, approve exceptions, watch the business improve.

**This compounds.** More orders → better RTO model. More comms → better timing.
More outcomes → agents make fewer mistakes. Day 90 is smarter than Day 1 automatically.

---

## Stack

- **`apps/shopify`** — Remix + Vite: embedded merchant dashboard + checkout/returns portals
- **`apps/shopify/worker`** — BullMQ process (separate Fly.io machine, always-on)
- **`packages/core`** — all business logic: workers, agents, communication, shipping
- **`packages/database`** — Prisma schema + Supabase Postgres
- **`packages/shared`** — shared types/utils
- **`apps/marketing`** — legacy Next.js (pre-existing TS errors, always ignore)

---

## Non-Negotiables

- `prisma db push` only — never `prisma migrate dev`
- `CheckoutSession` unique key: `shopifyCheckoutToken` (single field)
- Webhook routes = **thin enqueues only** — all logic in workers
- Model routing: **Haiku = classify/bulk**, **Sonnet = tools/reasoning** — never Opus
- Every schema change → `prisma db push` immediately
- Constants used in JSX must live in the route file, NOT in `.server.ts` (Remix bundler rule)
- `fly.toml` app process: `npm --prefix /app/apps/shopify run start`
- Workers call agents. **Agents never touch the queue.**

---

## Commands

```bash
# Schema push
DIRECT_URL="postgresql://postgres.qlewszzlsqoxlqrqyrit:Allthewayup2025@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require" \
DATABASE_URL="postgresql://postgres.qlewszzlsqoxlqrqyrit:Allthewayup2025@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require" \
npx prisma db push --schema=packages/database/prisma/schema.prisma

# Typecheck
cd apps/shopify && npx tsc --noEmit 2>&1 | grep "error"

# Build + deploy
cd apps/shopify && npm run build && cd ../.. && fly deploy --app pulseback

# Deploy Shopify extensions only
cd apps/shopify && npx shopify app deploy --allow-updates
```

---

## Schema Constraints

```
Customer        unique: shopId_phone, shopId_email
Order           unique: shopId_shopifyOrderId
CheckoutSession unique: shopifyCheckoutToken
OtpCode         unique: shopId_phone
WhatsAppSession unique: shopId_phone
Communication   no orderId relation — query via triggerRef field
Order           no city/state fields — address in shippingAddress JSON
```

---

## Key Files

```
Merchant dashboard:    apps/shopify/app/routes/app.*.tsx
Checkout portal:       apps/shopify/app/routes/checkout.$shop.tsx
Returns portal:        apps/shopify/app/routes/returns.$shop.tsx
WhatsApp webhook:      apps/shopify/app/routes/api.whatsapp.webhook.tsx
Checkout capture API:  apps/shopify/app/routes/api.checkout.capture.tsx
Upload endpoint:       apps/shopify/app/routes/api.upload.tsx
Shopify webhooks:      apps/shopify/app/routes/webhooks.*.tsx
Service layer:         apps/shopify/app/services/*.server.ts
BullMQ queues:         packages/core/src/queue/queues.ts
Workers:               packages/core/src/queue/workers/*.worker.ts
Agents (to build):     packages/core/src/agents/
Shiprocket:            packages/core/src/shipping/shiprocket.ts
Worker entry:          apps/shopify/worker/index.ts
Schema:                packages/database/prisma/schema.prisma
Fly config:            fly.toml
UI Extension:          apps/shopify/extensions/rto-checkout/
Payment Function:      apps/shopify/extensions/payment-customization/
```

---

## Agent Architecture

### The two-layer principle

```
INFRASTRUCTURE LAYER (workers)        INTELLIGENCE LAYER (agents)
─────────────────────────────         ──────────────────────────────
BullMQ dequeue                        CustomerMemory — load context
Retry / backoff / idempotency    →    Decision Agent — what to do
Dead letter queue                     Communication Agent — how to say it
Rate limiting                         Calendar Agent — when to send
                                      Outcome Tracker — did it work
```

Workers are infrastructure. They handle the mechanics of job processing.
Agents are intelligence. They make every meaningful decision.
Workers call agents. Agents return structured decisions. Workers execute.

---

### Sub-Agent 1: CustomerMemory — `agents/customer-memory.ts`

**Runs first in every worker. Every other agent receives this object.**

The single source of truth about a customer at a point in time. Replaces scattered
DB queries across workers — load once, pass everywhere.

```typescript
interface CustomerMemory {
  // Identity
  customerId: string
  shopId: string
  phone?: string
  email?: string

  // Live scores
  rtoRiskScore: number          // 0–100. >60 = high risk
  rfmScore: number              // 0–100. composite recency/frequency/monetary
  churnScore: number            // 0–100. 100 - rfmScore
  ltvTier: string               // new / low / mid / high / vip
  lifecycleStage: string        // prospect/active/champion/at_risk/lapsed/churned

  // Order history
  totalOrders: number
  totalReturns: number
  returnRate: number            // 0–1
  avgOrderValue: number         // ₹
  rtoCount: number
  lastOrderDate?: Date
  lastOrderValue?: number

  // Communication history — last 10, newest first
  recentComms: Array<{
    type: string                // abandoned_cart / cod_confirmation / ndr / winback / broadcast
    sentAt: Date
    replied: boolean
    converted: boolean          // cart recovered / order confirmed / issue resolved
    channel: string             // whatsapp / sms
    outcomeRef: string
  }>

  // Behavioural patterns (derived from history)
  hasIgnoredLast3Comms: boolean // KEY SIGNAL: true → silence is the right call
  preferredReplyHour?: number   // 0–23, IST. when they actually respond
  preferredLanguage: string     // en / hi — detected from WA messages
  sentiment: string             // positive / neutral / negative — from WA conversations

  // Coordination flags
  hasOpenNDR: boolean           // stuck shipment in flight
  hasPendingRefund: boolean     // refund not yet processed
  hasPendingReturn: boolean     // return not yet resolved
}
```

**Rule:** if `hasOpenNDR || hasPendingRefund || hasPendingReturn` → hold marketing comms
until resolved. Never send "come back and buy" to a customer with an unresolved issue.

---

### Sub-Agent 2: Decision Agent — `agents/decision/`

**Takes CustomerMemory + event context. Returns a structured decision — never raw text.**

One file per workflow. Each returns a typed decision object. The worker reads the
decision and executes. The reasoning is always stored in DB for audit and learning.

```typescript
// abandoned-cart.ts
interface CartDecision {
  action: "send" | "wait_2h" | "wait_until_morning" | "skip" | "escalate_human"
  touchNumber: 1 | 2 | 3
  offerDiscount: boolean
  discountPercent?: number      // 0–20
  channel: "whatsapp" | "sms"
  reasoning: string             // stored in DB — "Ignored Touch 1 last time, going to Touch 2"
}

// ndr.ts
interface NDRDecision {
  action: "send_wa" | "request_address_update" | "initiate_rto" | "escalate_merchant"
  messageIntent: "confirm_availability" | "address_correction" | "final_notice"
  reasoning: string
}

// retention.ts
interface RetentionDecision {
  action: "send" | "silence_90d"
  offerType: "discount" | "social_proof" | "new_arrivals" | "curiosity" | "appreciation"
  offerValue?: number           // ₹ or %
  reasoning: string
}

// rto.ts  (runs at checkout)
interface RTODecision {
  codAllowed: boolean
  score: number
  reasoning: string
}
```

**Universal decision rules (apply to all Decision Agents):**
- `hasIgnoredLast3Comms = true` → `action = skip/silence`. Never spam.
- `ltvTier = vip` → escalate to human, don't automate.
- Time gate: never send between 22:00–08:00 IST. Set `wait_until_morning`.
- `hasPendingRefund || hasPendingReturn || hasOpenNDR` → hold all marketing actions.

**Model routing:**
- Haiku: high-volume decisions (Touch 1 abandoned cart, standard NDR, bulk retention scoring)
- Sonnet: VIP customers, complaints, complex situations, win-back after long lapse

---

### Sub-Agent 3: Communication Agent — `agents/communication.ts`

**Owns ALL message generation. No hardcoded templates anywhere in the codebase.**

Every message sent by PulseOS passes through this agent. It writes personalised messages,
not templates. The same intent produces a different message for each customer based on
their history, language, tone, and what has worked before.

```typescript
interface CommInput {
  intent: string                // "cart_recovery_touch1" | "ndr_address_check" | "winback_tier_a"
  customerMemory: CustomerMemory
  brandVoice: {                 // from shop config
    name: string                // "Zara India" / "The Souled Store"
    tone: "formal" | "casual" | "friendly"
    language: "en" | "hi" | "auto"
  }
  constraints: {
    maxLength?: number          // WA has limits
    noDiscount?: boolean        // don't offer discount to COD-habitual customers
    includeLink?: string        // cart URL / tracking URL
  }
}

interface CommOutput {
  message: string               // final message, ready to send
  language: string              // en / hi
  tone: string                  // what tone was used
  outcomeRef: string            // UUID — used to close the feedback loop later
}
```

**Personalisation signals used:**
- `preferredLanguage`: write in Hindi if customer messages in Hindi
- `recentComms[].converted`: what worked before → use similar framing and structure
- `sentiment = negative`: empathetic tone, no discount pressure, no urgency
- `lifecycleStage = champion`: appreciative tone — "you've been with us from the start"
- `lifecycleStage = lapsed`: curiosity over desperation — "something new you might like"
- `totalReturns > 3`: acknowledge past issues — "we'd love to make it right"
- `rtoCount > 1`: nudge toward prepaid without saying "we don't trust you"

**Model routing:**
- Haiku: Touch 1 messages, standard NDR, bulk retention (speed matters)
- Sonnet: VIP win-back, complaint responses, customers with >5 orders (quality matters)

---

### Sub-Agent 4: Calendar Agent — `agents/calendar.ts` (Redis-based)

**Coordination layer. Prevents multiple workers from messaging the same customer on the same day.**

Every worker checks the Calendar Agent before sending any communication.
The calendar is a Redis key per customer: `comm_calendar:{customerId}`.

```typescript
interface CalendarState {
  lastCommSentAt?: Date
  pendingCommType?: string      // what's queued but not sent yet
  holdUntil?: Date              // set by any agent to block communications
  holdReason?: string           // "pending_ndR" / "pending_refund" / "frequency_cap"
}

// Priority order (highest wins when two agents want to send same day):
// Support > Operations > Logistics > Finance > Marketing
// Marketing defers 48h when it loses priority.
```

**How it works:**
1. Worker dequeues job, calls `CalendarAgent.canSend(customerId, commType)`
2. Calendar checks: last sent, any holds, frequency cap (max 1 marketing comm / 3 days)
3. Returns: `{ allowed: true }` or `{ allowed: false, retryAt: Date, reason: string }`
4. If allowed: worker proceeds, Calendar records the send
5. If blocked: worker reschedules the job (BullMQ delay)

---

### Sub-Agent 5: Outcome Tracker — `agents/outcome-tracker.ts`

**The feedback loop. This is what makes the system compound.**

Every Communication record has an `outcomeRef` (UUID generated by Communication Agent).
When an outcome is observed, we close the loop.

```
Message sent → outcomeRef = "comm_abc123" stored on Communication record
                    ↓
Outcome event fires:
  Cart recovered → outcome = "converted"
  Order delivered → outcome = "delivered"
  Customer replied → outcome = "replied"
  Cart abandoned again → outcome = "ignored"
  Customer blocked WA → outcome = "blocked"
                    ↓
db.communication.update({ where: { outcomeRef }, data: { outcome, outcomeAt } })
                    ↓
CustomerMemory updated: recentComms[0].converted = true/false
                    ↓
Next Decision Agent call for this customer sees updated history
"Touch 2 converted them last time. Skip Touch 1."
```

Outcome events are triggered from:
- `webhooks/orders.create` → marks abandoned cart session as converted
- `tracking.worker` → marks order delivered, closes COD confirmation
- `api.whatsapp.webhook` → marks replied/blocked on inbound message
- `abandoned.worker` → marks ignored if still abandoned after 48h

**Schema addition needed:**
```prisma
model Communication {
  // existing fields ...
  outcomeRef    String?   @unique  // UUID set at send time
  outcome       String?            // converted / replied / ignored / blocked / delivered
  outcomeAt     DateTime?
}
```

---

## The 6 Domain Agents

These are the high-level agents that own entire domains. They are built on top of the
sub-agents above. Each domain agent coordinates the sub-agents for its area.

---

### 1. Finance Agent — `agents/finance.ts`
**Replaces:** spreadsheets, manual reconciliation, gut-feel cash flow management.

| Capability | What it does |
|---|---|
| COD Float Monitor | Tracks every COD order in transit. Amount, days outstanding, expected remittance. Alerts on overdue remittances. |
| True ROAS Engine | Ad spend → attributed orders → RTO outcomes → net realised revenue. Not vanity ROAS. |
| Cash Flow Forecast | Projects 7/14/30 day cash position. Inputs: orders in transit, pending refunds, Razorpay T+2 schedule. |
| Payment Reconciliation | Auto-matches Razorpay settlements + Shiprocket remittances to Order records. Flags mismatches. |
| Fraud Detection | Return fraud clusters (same address/phone), unusual refund velocity, card testing patterns. |
| Margin Intelligence | Per-SKU: revenue − shipping − return rate − payment fees = actual contribution margin. |

Model: Haiku for reconciliation/matching. Sonnet for pattern detection + forecasting.
APIs needed: Shiprocket remittance API, Razorpay settlements API.

---

### 2. Logistics Agent — `agents/logistics.ts`
**Replaces:** manual Shiprocket dashboard monitoring, reactive courier management.

| Capability | What it does |
|---|---|
| Shipment Triage | Classifies every shipment hourly: on_track / at_risk / stuck / ndr / rto_candidate. Merchant sees exceptions only. |
| NDR Resolution | Per-shipment decision (not batch): attempt count + customer WA responsiveness + address confidence → re-attempt / address fix / RTO / escalate. |
| Courier Intelligence | Per-pincode success rates by courier. "Delhivery 34% RTO in 500072 — route to Ekart." Eventually: auto-select courier at order creation. |
| SLA Monitor | Dispatch SLA, delivery SLA, return pickup SLA. Alerts before breach, not after. |
| Reverse Logistics | Schedules pickups, tracks return transit, confirms warehouse receipt, triggers refund. |
| Warehouse Queue (future) | Priority packing list, inventory gap flags, reorder signals. |

Model: Haiku for triage/classification. Sonnet for complex NDR decisions.

---

### 3. Marketing Agent — `agents/marketing.ts`
**Replaces:** manual segmentation, template blasts, guessed timing.

| Capability | What it does |
|---|---|
| Autonomous Campaigns | Decides what to send to whom when — without merchant initiating. Event-triggered + behavioural. |
| Per-Customer Messages | Communication Agent writes unique message per customer, not per segment. |
| Offer Computation | Optimal discount per customer: VIP → no discount. Mid-tier at-risk → 10%. Low-value churned → silence (LTV < discount cost). |
| Frequency Intelligence | Knows each customer's tolerance. 3 comms / 7 days with no reply → silence until next week. |
| Attribution | Every campaign comm has outcomeRef. Conversion closed when order placed. No manual tracking. |
| Calendar Coordination | No customer gets 2 marketing comms same day. Priority system picks one, other defers 48h. |
| A/B Intelligence (future) | 10% of decisions try different framing. Tracks what converts per segment. |

Model: Haiku for scheduling/frequency checks. Sonnet for personalised message generation.

---

### 4. Support Agent — `agents/support.ts`
**Replaces:** human agents answering WISMO. Currently built (classify + respond). Enhanced vision:

| Capability | Current | Target |
|---|---|---|
| Intent classification | ✅ Haiku classifies | ✅ Same |
| Order status / tracking | ✅ Sonnet with tools | ✅ Same |
| Return initiation | ✅ Sonnet with tools | ✅ Same |
| Full context recall | ❌ | Load full CustomerMemory — never ask for order number |
| Proactive support | ❌ | Shipment delayed >2d → send WA before customer asks |
| Address update | ❌ | Call Shiprocket API to update delivery address |
| Refund processing | ❌ | Initiate with merchant approval above threshold |
| Courier escalation | ❌ | Create Shiprocket support ticket |
| Sentiment escalation | ❌ | Anger/frustration detected → immediately escalate to human |
| Resolution tracking | ❌ | Was issue resolved? Did they order again? Customer satisfaction signal. |

Target: 90% resolved autonomously. 10% escalated to human. Zero bot-frustration complaints.
Model: Haiku for simple queries. Sonnet for complaints/complex. **Never Haiku for angry customers.**

---

### 5. Operations Agent — `agents/operations.ts`
**Replaces:** WhatsApp group approvals, manual exception handling, reactive ops.

| Capability | What it does |
|---|---|
| Exception Surface | Out of 1000 daily events, merchant sees only the 10 that need human judgement. |
| Approval Workflow | WA message to merchant for decisions above threshold. "Return ₹3,400 outside policy — Approve? [Yes] [No] [Call]". Merchant replies → agent executes. |
| Policy Enforcement | Return window, COD limits, blocked pincodes — enforced automatically. Exceptions surface. |
| Inventory Intelligence (future) | Sell-through per SKU. "Product X stocks out in 8 days." "Product Y in 43 carts, never purchased — price issue?" |
| Supplier Data (future) | Auto-generates courier/supplier performance data for negotiation meetings. |

Model: Haiku for classification/routing. Sonnet for exception summaries + recommendations.

---

### 6. Intelligence Agent — `agents/intelligence.ts`
**Replaces:** nobody does this today. The data exists but no one has time to find the patterns.

| Capability | What it does |
|---|---|
| Daily Briefing | ✅ Built. 9pm IST. Conversational merchant summary. Haiku writes it. |
| Weekly Pattern Report | Sonnet analyses 7-day outcomes. "Tuesday 6pm WA converts 3.1x vs Sunday morning for your store." |
| Anomaly Detection | Flags deviations before they're problems: RTO spike, return rate spike, support volume surge. |
| Cohort Analysis | Customers acquired Month 1 vs Month 6. Which acquisition channel → best LTV? |
| Board Pack (future) | Auto-generated monthly business report. Stakeholder app reads same data. |

Model: Sonnet for all analysis. Data-heavy — quality over speed.

---

## Agent Coordination

Agents share context through CustomerMemory and coordinate via the Calendar Agent.
The most powerful decisions happen across domain boundaries.

```
Scenario 1 — Abandoned cart + stuck shipment
  Marketing Agent: wants to send "You left something behind"
  CustomerMemory: hasOpenNDR = true
  Calendar Agent: hold marketing. Logistics takes priority.
  Resolution: NDR resolved → Marketing sends cart recovery next day.

Scenario 2 — Win-back + pending refund
  Retention Agent: wants to send win-back offer
  CustomerMemory: hasPendingRefund = true (₹800, 5 days pending)
  Calendar Agent: hold marketing.
  Resolution: refund processed → Retention sends win-back with "we've sorted your refund" opener.

Scenario 3 — RTO risk + loyal customer
  RTO Agent: score 74, recommends COD block
  CustomerMemory: 8 orders, 0 RTOs, vip tier
  Operations Agent: override block. Flag for merchant review but don't block.
  Score alone is never enough — full context wins.

Scenario 4 — Angry customer + retention workflow
  Support Agent: detects frustration in WA message, escalates to human
  Calendar Agent: sets 7-day hold on ALL comms for this customer
  Marketing Agent: win-back job arrives, Calendar blocks it, defers 7 days
  Resolution: human resolves, hold lifted, retention sequence resumes.
```

**Communication Priority (highest wins):**
```
Support > Operations > Logistics > Finance > Marketing
```
Lower priority agents defer 48h when blocked. Never two comms same day to same customer.

---

## The Merchant Interface

Merchant never needs to check 6 dashboards. Everything surfaces through:

1. **Daily WA briefing (9pm)** — what happened, what agents decided, what needs attention
2. **Exception queue** — the ~10 things per day needing human judgement
3. **Approval requests** — yes/no decisions via WA reply (return approval, RTO override, etc.)
4. **Dashboard** — available for deep dives, not required for daily ops

Most days: read briefing → approve 2-3 exceptions → done. The rest runs itself.

---

## Core Workflows

### 1. Order Lifecycle
```
Shopify order.created webhook → thin enqueue
  → webhook.worker: create Order + Customer in DB
  → COD? → cod_confirmation WA (customer confirms YES/NO)
  → Prepaid? → order_confirmed WA
  → Fulfillment created → tracking.worker polls every hour
  → Shiprocket webhook → real-time tracking update
  → Delivered → outcome tracked → RFM rescored → retention.worker queued
  → RTO → isRTO=true → rtoCount++ → RTO score increases for future orders
```

### 2. Checkout Flow (custom portal)
```
Customer → /checkout/:shop → phone input + DPDP consent
  → OTP sent → verified
  → RTO Decision Agent: score computed (pincode + phone history)
  → COD shown/hidden based on shop.rtoThreshold
  → COD or Prepaid (Razorpay) → Shopify draft order created
  → Order confirmed → CheckoutSession.status = completed
  → Abandoned (left without ordering) → status = abandoned → abandoned.worker queued
```

### 3. Checkout Flow (Shopify native — extension)
```
Customer enters contact/address in Shopify checkout
  → rto-checkout UI extension fires silently
  → POST /api/checkout/capture → RTO score computed
  → _pulseback_cod_blocked cart attribute set
  → pulseback-payment-customization Function reads attribute
  → COD payment method hidden if blocked
  → Warning banner shown to customer
```

### 4. Returns Flow
```
Customer → /returns/:shop → phone + OTP
  → eligible orders: delivered + <7 days + no active return
  → select items + reason + photos → Supabase Storage
  → ReturnRequest created (status = pending)
  → WA confirmation to customer
  → Merchant: /app/returns → approve / reject / schedule_pickup
  → Approved → Shiprocket reverse pickup created (JWT cached 9 days)
  → shiprocketOrderId stored on ReturnRequest
```

### 5. NDR Flow
```
ndr.worker (hourly) → shipments with failedAttempts > 0
  → NDR Decision Agent: assess per shipment
  → isStuck = true if >3 days no update
  → WA sent to customer (ndrAttempts++)
  → Merchant: /app/ndr → stuck shipments, take action
  → Resolved: delivered → isStuck = false → outcome tracked
  → Unresolved: rtoInitiatedAt set
```

### 6. Abandoned Cart Recovery
```
abandoned.worker (every 5min) → CheckoutSessions status = abandoned
  → Cart Decision Agent: check CustomerMemory
  → hasIgnoredLast3Comms? → skip
  → Touch 1 (+30min): personalised cart reminder
  → Touch 2 (+4hr): different angle (question / social proof)
  → Touch 3 (+24hr): discount if cart > ₹500 and LTV justifies it
  → Order placed → status = recovered → outcome tracked
```

### 7. Retention Engine
```
retention.worker (daily 10am IST) → all customers
  → RFM score: recency(50%) + frequency(30%) + monetary(20%)
  → churnScore = 100 - RFM
  → lifecycleStage updated: new/active/champion/at_risk/lapsed/churned
  → ltvTier updated: new/low/mid/high/vip
  → Stage changes → Retention Decision Agent decides action

winback.worker (daily 11am IST):
  → Retention Decision Agent per customer
  → Tier A (31–90d lapsed): warm message, small offer
  → Tier B (91–180d churned): bigger offer, different angle
  → Tier C (180d+): silence for 90 days
  → All comms via Communication Agent (no templates)

briefing.worker (daily 9pm IST):
  → 24hr stats compiled
  → Intelligence Agent (Haiku) → conversational WA paragraph
  → Sent to shop.ownerPhone
```

### 8. WhatsApp Customer Support
```
Customer WA → api.whatsapp.webhook
  → Haiku classifies intent: order_status / return / complaint / other
  → CustomerMemory loaded
  → Sentiment check: angry? → Sonnet + escalation flag
  → Sonnet with tools: get_order_status, get_customer_info,
    update_delivery_address, initiate_return, escalate_to_human
  → Response via WA
  → Conversation + outcome stored in WhatsAppSession
  → Outcome tracked on Communication record
```

### 9. Marketing Broadcast
```
Merchant: /app/marketing → select segment → write message (or agent writes it)
  → sendBroadcast() → queueCommunication for all eligible phones
  → Calendar Agent: check per customer before sending
  → communication.worker: quiet hours + frequency cap
  → Communication Agent: personalise per customer
  → Sends via WA provider
  → triggerType = "broadcast_{timestamp}" → campaign log
  → Outcomes tracked via outcomeRef
```

---

## Product Architecture

### Layer 0 — Intelligence Infrastructure (BUILT ✅)
- BullMQ + Redis queue system
- 8 workers: webhook, communication, tracking, NDR, abandoned, retention, winback, briefing
- Prisma schema + Supabase Postgres
- Shiprocket integration (JWT cached)
- Supabase Storage (photo uploads)

### Layer 1 — Merchant Platform (BUILT ✅)
- Embedded merchant dashboard (`/app/*` routes)
- Public checkout portal (`/checkout/:shop`)
- Public returns portal (`/returns/:shop`)
- WhatsApp AI support agent
- DPDP consent, OTP auth, Razorpay payments

### Layer 2 — Shopify Native Checkout (BUILT ✅)
- `rto-checkout` UI extension — silent RTO capture at checkout
- `pulseback-payment-customization` Function — hides COD when blocked
- `api.checkout.capture` — CORS-enabled scoring endpoint
- Deployed: pulseback-9

### Layer 3 — Agent Foundation (NEXT)
- `CustomerMemory` loader
- `OutcomeTracker` + Communication schema update
- `CalendarAgent` (Redis coordination)
- `DecisionAgent` per workflow (abandoned-cart first)
- `CommunicationAgent` (centralise all message generation)

### Layer 4 — Domain Agents
- Finance Agent v1 (COD float + true ROAS)
- Logistics Agent (triage + courier intelligence)
- Operations Agent (exception surface + WA approvals)
- Intelligence Agent (weekly patterns + anomaly detection)
- Marketing Agent (autonomous campaigns)

### Layer 5 — Web Surfaces
- `packages/api` tRPC layer (prerequisite for all below)
- Merchant web app (PWA — exception queue, approvals)
- Customer web app (PWA — tracking, returns, reorder)
- Stakeholder view (read-only analytics)
- Ops/warehouse app (scan AWB, inspect returns)
- Logistics partner portal (3PL)

---

## Build Priority Queue

### Phase 0 — DONE ✅
All Layer 0, 1, 2 above.

### Phase 1 — Agent Foundation (build next)
1. `Communication` schema: add `outcomeRef`, `outcome`, `outcomeAt`
2. `agents/customer-memory.ts` — CustomerMemory loader
3. `agents/outcome-tracker.ts` — close the feedback loop
4. `agents/calendar.ts` — Redis coordination layer
5. `agents/decision/abandoned-cart.ts` — first Decision Agent
6. Migrate `abandoned.worker` to use Decision Agent pattern

### Phase 2 — Expand Agents
7. `agents/communication.ts` — centralise all message generation
8. `agents/decision/ndr.ts` — NDR Decision Agent
9. `agents/decision/retention.ts` — Retention Decision Agent
10. `agents/finance.ts` v1 — COD float monitor + true ROAS

### Phase 3 — Surfaces
11. `packages/api` — tRPC layer, JWT auth, rate limited
12. Merchant web app (PWA)
13. Customer web app (PWA)

### Phase 4 — Full Domain Agents
14. Logistics Agent (courier intelligence, SLA monitor)
15. Operations Agent (exception surface, WA approvals)
16. Intelligence Agent (weekly patterns, anomaly detection)
17. Marketing Agent (autonomous campaigns, attribution)

### Phase 5 — Ecosystem + Moat
18. Finance Agent v2 (reconciliation, forecasting, fraud)
19. Stakeholder + Ops + Logistics apps
20. Multi-agent orchestration (agents consult each other before acting)

---

## Data Flywheel

```
Month 1:  100 orders  → weak signal, rules-based decisions
Month 3:  1,000 orders → RTO model identifies 3 high-risk pincodes
Month 6:  5,000 orders → agents learn Tuesday 6pm WA gets 2x cart recovery
Month 12: 20,000 orders → per-customer intelligence no human team could produce
```

More orders → better RTO model
More comms → better timing model
More resolutions → better support model
More outcomes → better decision model
Better decisions → better outcomes → better data → better decisions

**The moat: customer-specific data. Competitors can copy the product. They cannot copy the data.**

---

## Current Blockers

| Blocker | Action needed | Unlocks |
|---|---|---|
| App not installed on store | User: visit `/auth?shop=...` | Everything |
| Shiprocket credentials not in settings | User: `/app/settings` | Reverse pickups |
| Shiprocket webhook not configured | User: Shiprocket dashboard | Real-time tracking |
| Owner phone not set | User: `/app/settings` | Daily briefing |
| Gupshup not approved | User: follow up with Gupshup | Live WA sending |
| Historical order data empty | Build: backfill script | RTO model signal |
| Shopify extension not activated | User: Shopify Admin | COD blocking live |

---

## Secrets on Fly (current)

```
ANTHROPIC_API_KEY    ✅
DATABASE_URL         ✅
DIRECT_URL           ✅
REDIS_URL            ✅
SHOPIFY_API_KEY      ✅
SHOPIFY_API_SECRET   ✅
SHOPIFY_APP_URL      ✅
SESSION_SECRET       ✅
RAZORPAY_KEY_ID      ✅
RAZORPAY_KEY_SECRET  ✅
SUPABASE_URL         ✅
SUPABASE_SERVICE_KEY ✅
WA_VERIFY_TOKEN      ✅ (set: pulseback_2026)
GUPSHUP_API_KEY      ❌ pending approval
GUPSHUP_APP_NAME     ❌ pending approval
```
