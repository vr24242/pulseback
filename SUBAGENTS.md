# PulseOS Subagent Framework

## Overview

The Subagent Framework enables **autonomous background workflows** that run continuously separate from event-driven workers. Subagents are specialized autonomous agents that handle specific business domains and run on defined schedules.

**Key Difference from Workers:**
- **Workers** react to events (webhooks, queue jobs) — synchronous/reactive
- **Subagents** run on schedule — proactive, asynchronous, continuous

**Use Cases:**
- Marketing operations (process signups, send weekly emails, segment customers)
- Intelligence discovery (pattern analysis, anomaly detection, forecasting)
- System optimization (track agent metrics, detect drift, reweight decisions)
- Integration sync (sync with external systems, retry failed operations)
- QA audit (validate decisions, track outcomes, quality checks)

---

## Architecture

### 1. BaseSubagent (Abstract Class)

All subagents inherit from `BaseSubagent` which provides:

```typescript
abstract class BaseSubagent implements ISubagent {
  config: SubagentConfig
  
  // Main execution wrapper with retry logic
  async executeWithRetry(ctx: SubagentContext, attempt: number = 0): Promise<SubagentResult>
  
  // Override in subclass
  abstract async execute(ctx: SubagentContext): Promise<SubagentResult>
  
  // Optional overrides
  async healthCheck(): Promise<boolean>
  async validateConfig(): Promise<void>
  
  // Scheduling
  getNextRun(): Date
  private calculateNextRun(): Date  // supports realtime, hourly, daily, weekly, monthly, on-demand
  
  // Helpers
  protected createContext(shopId?: string): SubagentContext
  protected successResult(itemsProcessed, metrics?): SubagentResult
  protected partialResult(itemsProcessed, itemsFailed, warnings?, metrics?): SubagentResult
}
```

**Features:**
- Automatic retry with exponential backoff
- Configurable scheduling (realtime, hourly, daily, weekly, monthly, on-demand)
- Execution lifecycle management
- Error handling & warnings
- Metrics collection

### 2. SubagentOrchestrator

Manages all subagent instances:

```typescript
const orchestrator = getOrchestrator()
orchestrator.register(mySubagents)

// Get subagents due to run now
const dueSubagents = orchestrator.getNextDueSubagents()

// Execute single subagent
const result = await orchestrator.executeSubagent(subagent)

// Execute all due subagents
const results = await orchestrator.executeAllDueSubagents()

// Get metrics
const metrics = orchestrator.getSummaryMetrics()
```

**Orchestrator Responsibilities:**
- Register subagent instances
- Track next run times
- Execute subagents when due
- Collect execution metrics
- Handle failures gracefully

### 3. Subagent Types

Five domain types:

| Type | Purpose | Examples |
|---|---|---|
| `marketing-ops` | Marketing operations | Process signups, send emails, rank updates, cold outreach |
| `intelligence-analysis` | Pattern discovery & analysis | Weekly insights, anomaly detection, forecasting |
| `system-optimization` | System tuning & learning | Agent metrics, drift detection, reweighting |
| `integration-sync` | External system sync | Meta CAPI, Shopify, Shiprocket, Razorpay |
| `qa-audit` | Quality assurance | Decision validation, outcome tracking |

### 4. Scheduling

Each subagent has a `schedule` field:

```typescript
type SubagentSchedule = 
  | "realtime"      // Process immediately (queue every second)
  | "hourly"        // Every hour
  | "daily"         // Daily at specific time (e.g., "06:00")
  | "weekly"        // Weekly at day+time (e.g., "Monday 10:00")
  | "monthly"       // Monthly at date+time (e.g., "1 06:00")
  | "on-demand"     // Manual trigger only
```

**Time is in IST (Asia/Kolkata) timezone.**

---

## Building a Subagent

### Step 1: Extend BaseSubagent

```typescript
import { BaseSubagent } from "./base"
import { SubagentContext, SubagentResult, SubagentConfig } from "./types"

export class MyDomainSubagent extends BaseSubagent {
  // Implement the abstract execute() method
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    // Your domain-specific logic here
    // Return successResult(ctx, itemsProcessed, metrics)
  }

  // Optional: Custom health check
  async healthCheck(): Promise<boolean> {
    // Check if all required services are available
    return true
  }

  // Optional: Custom config validation
  async validateConfig(): Promise<void> {
    await super.validateConfig()
    // Add domain-specific validation
  }
}
```

### Step 2: Create Subagent Instances

```typescript
export function createMyDomainSubagents(): MyDomainSubagent[] {
  return [
    new MyDomainSubagent({
      id: "my-domain-hourly",
      type: "my-domain",  // Must be one of the 5 types above
      name: "My Domain Subagent - Hourly",
      description: "Process hourly tasks",
      schedule: "hourly",
      maxConcurrency: 1,
      retryConfig: {
        maxRetries: 3,
        backoffMs: 5000,
        backoffMultiplier: 2,
      },
      timeoutMs: 300000,  // 5 minutes
      enabled: true,
    }),
    // ... add more instances with different schedules
  ]
}
```

### Step 3: Register with Orchestrator

```typescript
import { getOrchestrator, createMyDomainSubagents } from "@d2c/core/subagents"

const orchestrator = getOrchestrator()
orchestrator.register(createMyDomainSubagents())
```

### Step 4: Orchestrator Runs It

The `SubagentsOrchestrator` worker runs every 5 minutes and:
1. Checks which subagents are due
2. Executes them
3. Records metrics
4. Returns results

---

## Real Example: MarketingOpsSubagent

Located at: `packages/core/src/subagents/marketing-ops.ts`

**What it does:**
- **Hourly:** Process new signups, send confirmation emails, recalculate ranks, send referral emails
- **Weekly (Sunday 10am):** Send weekly rank update emails to all early adopters
- **Daily (8am):** Segment early adopters, cold email batching, analytics

**Usage:**

```typescript
import { createMarketingOpsSubagents } from "@d2c/core/subagents"

const orchestrator = getOrchestrator()
orchestrator.register(createMarketingOpsSubagents())
```

The orchestrator automatically:
1. Runs hourly instance every hour
2. Runs weekly instance every Sunday at 10am IST
3. Runs daily instance every day at 8am IST

---

## Subagent Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ SubagentOrchestrator checks every 5 minutes               │
│   • Which subagents are due to run now?                   │
│   • Are they enabled?                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ For each due subagent:                                    │
│   1. Create SubagentContext (executionId, startTime)      │
│   2. Validate config                                      │
│   3. Call healthCheck()                                   │
│   4. Call executeWithRetry()                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ executeWithRetry() executes execute() with retry logic:   │
│   • Execute main business logic                           │
│   • On error: retry with exponential backoff              │
│   • Max retries: from config.retryConfig.maxRetries       │
│   • Record execution time, items processed, errors        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Return SubagentResult:                                    │
│   • status: "success" | "partial" | "failure"             │
│   • itemsProcessed: number                                │
│   • itemsFailed: number                                   │
│   • metrics: { [key: string]: number | string }           │
│   • warnings: string[]                                    │
│   • nextRunAt: Date (calculated automatically)            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Orchestrator records in execution history                │
│   • Logs to console                                       │
│   • Tracks metrics: success rate, items processed, etc.   │
│   • Stores in memory (not persisted to DB yet)            │
└─────────────────────────────────────────────────────────────┘
```

---

## SubagentResult Structure

```typescript
interface SubagentResult {
  executionId: string          // Unique execution ID (UUID)
  type: SubagentType           // marketing-ops, intelligence-analysis, etc.
  status: "success" | "partial" | "failure"
  itemsProcessed: number       // How many items succeeded
  itemsFailed: number          // How many items failed
  executionTimeMs: number      // Total execution time in milliseconds
  error?: string               // Error message (if failure)
  warnings: string[]           // Non-fatal warnings
  metrics: {                   // Custom metrics
    [key: string]: number | string
  }
  nextRunAt?: Date             // When this subagent will run next
}
```

**Example result from MarketingOpsSubagent:**

```typescript
{
  executionId: "550e8400-e29b-41d4-a716-446655440000",
  type: "marketing-ops",
  status: "success",
  itemsProcessed: 42,  // 42 new signups processed
  itemsFailed: 2,      // 2 failed to send email
  executionTimeMs: 8543,
  warnings: [
    "Failed to send confirmation to spam@test.com: Invalid email",
    "Failed to send referral bonus to invalid@example.com: API rate limit"
  ],
  metrics: {
    unprocessedSignups: 42,
    successfulEmails: 40,
    failedEmails: 2,
    ranksRecalculated: 1200,
  },
  nextRunAt: new Date("2026-05-18T15:00:00Z")
}
```

---

## Monitoring & Metrics

```typescript
const orchestrator = getOrchestrator()

// Get upcoming runs (next 10)
const upcoming = orchestrator.getUpcomingRuns(10)
// [
//   { subagentId: 'marketing-ops-hourly', nextRunAt: Date, schedule: 'hourly' },
//   { subagentId: 'marketing-ops-weekly', nextRunAt: Date, schedule: 'weekly' },
//   ...
// ]

// Get execution history for a specific subagent
const history = orchestrator.getExecutionHistory('marketing-ops-hourly', 10)
// Last 10 executions for hourly marketing ops subagent

// Get summary metrics
const metrics = orchestrator.getSummaryMetrics()
// {
//   totalExecutions: 120,
//   successfulExecutions: 115,
//   failedExecutions: 5,
//   successRate: "95.83%",
//   totalItemsProcessed: 5420,
//   totalItemsFailed: 127,
//   avgExecutionTimeMs: "8234"
// }
```

---

## Best Practices

### 1. Keep Execution Time Short

**Bad:**
```typescript
async execute(ctx: SubagentContext): Promise<SubagentResult> {
  // Waiting 1 hour for external API
  const data = await slowApi.fetch()  // ❌ Blocks orchestrator
}
```

**Good:**
```typescript
async execute(ctx: SubagentContext): Promise<SubagentResult> {
  // Queue the work, check status in next run
  await enqueueWork()  // ✅ Quick return
  return this.successResult(ctx, queuedCount)
}
```

### 2. Handle Errors Gracefully

**Bad:**
```typescript
async execute(ctx: SubagentContext): Promise<SubagentResult> {
  // Single failure crashes the whole execution
  await processItem(item1)  // ❌ If this throws, item2 never runs
  await processItem(item2)
}
```

**Good:**
```typescript
async execute(ctx: SubagentContext): Promise<SubagentResult> {
  const warnings: string[] = []
  let processed = 0, failed = 0
  
  for (const item of items) {
    try {
      await processItem(item)  // ✅ Process each independently
      processed++
    } catch (error) {
      failed++
      warnings.push(`Item ${item.id}: ${error.message}`)
    }
  }
  
  return this.partialResult(ctx, processed, failed, warnings)
}
```

### 3. Use Appropriate Config Values

```typescript
// For hourly tasks that touch database
{
  schedule: "hourly",
  maxConcurrency: 1,
  retryConfig: {
    maxRetries: 3,
    backoffMs: 5000,
    backoffMultiplier: 2,
  },
  timeoutMs: 300000,  // 5 minutes
}

// For heavy computation (daily analysis)
{
  schedule: "daily",
  scheduledTime: "02:00",  // Run at 2am when traffic is low
  maxConcurrency: 1,
  retryConfig: {
    maxRetries: 1,  // Don't retry heavy jobs
    backoffMs: 10000,
    backoffMultiplier: 1,
  },
  timeoutMs: 1800000,  // 30 minutes
}
```

### 4. Log Meaningful Metrics

```typescript
return this.successResult(ctx, itemsProcessed, {
  // ✅ Good — specific metrics
  emailsSent: 150,
  emailsFailed: 3,
  ranksRecalculated: 1200,
  averageEmailTimeMs: 45,
  topCompanySizeSegment: 25,
  
  // ❌ Bad — vague metrics
  "done": true,
  "items": 153,
})
```

### 5. Schedule Appropriately

```typescript
// For tasks that don't depend on each other
schedule: "hourly"  // ✅ Independent hourly runs

// For tasks that depend on each other, run at different times
{
  // First: Process data (10am)
  schedule: "daily",
  scheduledTime: "10:00",
  
  // Second: Analyze data (11am)
  schedule: "daily",
  scheduledTime: "11:00",
}

// For low-priority tasks
schedule: "weekly"  // ✅ Weekly is sufficient

// For high-urgency
schedule: "realtime"  // ✅ Every second (use sparingly)
```

---

## Deployment Checklist

Before deploying subagents to production:

- [ ] All subagent configs have `enabled: true`
- [ ] Retry configs are reasonable (maxRetries ≤ 5, backoffMs ≥ 1000)
- [ ] Timeout is longer than expected execution time
- [ ] Schedule times are valid (e.g., "08:00" for daily, "Monday 10:00" for weekly)
- [ ] All environment variables required by subagents are set (RESEND_API_KEY, DATABASE_URL, etc.)
- [ ] Health checks pass for all subagents
- [ ] Orchestrator worker is deployed and running
- [ ] Redis queue is healthy
- [ ] Monitor logs for first 24 hours
- [ ] Verify execution metrics show expected throughput

---

## Next Steps: Building More Subagents

After MarketingOpsSubagent is tested and deployed:

### 2. IntelligenceAnalysisSubagent
**Purpose:** Weekly pattern discovery, anomaly detection, forecasting

**File:** `packages/core/src/subagents/intelligence-analysis.ts`

```typescript
export class IntelligenceAnalysisSubagent extends BaseSubagent {
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    // Weekly: analyze last 7 days of outcomes
    // Find patterns: "Tuesday 6pm WA converts 3.1x vs Sunday"
    // Detect anomalies: "RTO spike detected in pincode 500001"
    // Forecast: "Expected 450 signups next week"
  }
}
```

### 3. SystemOptimizationSubagent
**Purpose:** Track agent metrics, detect drift, reweight decisions

**File:** `packages/core/src/subagents/system-optimization.ts`

```typescript
export class SystemOptimizationSubagent extends BaseSubagent {
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    // Daily: compute agent success rates
    // Weekly: detect drift in decision quality
    // Monthly: reweight agent decisions based on outcomes
  }
}
```

### 4. IntegrationSyncSubagent
**Purpose:** Sync with Meta CAPI, Shopify, Shiprocket, Razorpay

**File:** `packages/core/src/subagents/integration-sync.ts`

```typescript
export class IntegrationSyncSubagent extends BaseSubagent {
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    // Hourly: sync recent orders to Meta CAPI
    // Hourly: retry failed Shiprocket pickups
    // Daily: reconcile Razorpay settlements
  }
}
```

### 5. QAAuditSubagent
**Purpose:** Decision validation, outcome tracking, quality checks

**File:** `packages/core/src/subagents/qa-audit.ts`

```typescript
export class QAAuditSubagent extends BaseSubagent {
  async execute(ctx: SubagentContext): Promise<SubagentResult> {
    // Weekly: validate decision reasoning
    // Daily: track communication quality
    // Monthly: audit agent decision accuracy
  }
}
```

---

## Files

```
packages/core/src/subagents/
├── types.ts                  # Type definitions (SubagentConfig, SubagentContext, etc.)
├── base.ts                   # BaseSubagent abstract class
├── marketing-ops.ts          # Marketing Ops Subagent (✅ implemented)
├── orchestrator.ts           # SubagentOrchestrator
└── index.ts                  # Exports all subagent types and functions

packages/core/src/queue/workers/
└── subagents-orchestrator.worker.ts  # Worker that runs orchestrator every 5 min

apps/shopify/worker/
└── index.ts                  # Updated to start subagents orchestrator
```

---

## Troubleshooting

### Subagent not running
1. Check `enabled: true` in config
2. Check next run time: `orchestrator.getUpcomingRuns()`
3. Check orchestrator worker logs
4. Verify Redis connection

### Execution failures
1. Check `healthCheck()` — are required services available?
2. Check timeout — is `timeoutMs` long enough?
3. Check retry config — is `maxRetries` sufficient?
4. Check logs for specific error messages

### High failure rate
1. Reduce `maxConcurrency` — might be overloaded
2. Increase `backoffMs` — give services time to recover
3. Check database connections — connection pool might be exhausted
4. Check external API rates — might be hitting rate limits

### Performance issues
1. Profile execution time with `executionTimeMs` in result
2. Add `await orchestrator.getSummaryMetrics()` to check average times
3. Reduce batch sizes or split into multiple subagents
4. Run heavy tasks at off-peak hours (e.g., 2am instead of noon)

---

## Summary

The Subagent Framework provides a structured way to build autonomous background workflows:

1. **Extend BaseSubagent** with your domain logic
2. **Create instances** with appropriate configs
3. **Register with Orchestrator** to start running automatically
4. **Monitor metrics** to ensure smooth operation
5. **Scale by adding more subagents** as needs grow

Each subagent is independent, testable, and scalable. The orchestrator coordinates them all, ensuring smooth operation and easy monitoring.
