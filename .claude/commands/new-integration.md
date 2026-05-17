# Scaffold a new third-party integration

Scaffold a complete integration for: **$ARGUMENTS**

## Steps to follow

1. **Read** `docs/PULSE_OS.md` first to understand where this integration fits in the Core Loop

2. **Create** `packages/core/src/integrations/$ARGUMENTS/` with:
   - `client.ts` — typed API client (HTTP calls, auth, response types)
   - `types.ts` — Zod schemas for all request/response payloads
   - `index.ts` — barrel export

3. **If this integration needs async processing** (webhooks, polling, batch sends):
   - Add job type to `packages/core/src/queue/queues.ts`
   - Create `packages/core/src/queue/workers/$ARGUMENTS.worker.ts`
     → Follow the exact pattern in `tracking.worker.ts` (Worker export, concurrency, error handlers)
   - Export start fn from `packages/core/src/queue/index.ts`
   - Register in `apps/shopify/worker/index.ts`

4. **If this integration receives webhooks**:
   - Create `apps/shopify/app/routes/api.$ARGUMENTS.webhook.tsx`
   - Route must be a **thin enqueue only** — authenticate, enqueue to BullMQ, return 200
   - All processing logic goes in the worker, never in the route

5. **If this integration sends outbound messages**:
   - Route through `queue/communication` (respects quiet hours, frequency cap, retry)
   - Add template name to the communication worker's handler

6. **Schema changes** (if new DB fields needed):
   - Edit `packages/database/prisma/schema.prisma`
   - Run prisma db push (command in CLAUDE.md)

7. **Typecheck** when done:
   ```
   npx tsc --noEmit 2>&1 | grep -v "apps/marketing" | grep "error"
   ```

## Reference patterns
- Worker pattern: `packages/core/src/queue/workers/tracking.worker.ts`
- Thin webhook route: `apps/shopify/app/routes/webhooks.orders.create.tsx`
- Queue helper: `packages/core/src/queue/queues.ts` → `queueTracking()` pattern
