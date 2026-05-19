/**
 * PulseOS tRPC API
 * Unified API layer for all web surfaces (PWAs, dashboards, etc.)
 *
 * Routers:
 * - public: unauthenticated endpoints (customer tracking, returns initiation)
 * - merchant: authenticated merchant endpoints (orders, customers, exceptions, approvals)
 */

// Use the shared tRPC instance from trpc.ts
import { router, publicProcedure, procedure } from "./trpc.js"
export { t } from "./trpc.js"
import { merchantRouter } from "./routers/merchant.js"
import { customerRouter } from "./routers/customer.js"
import { authRouter } from "./routers/auth.js"
import { healthRouter } from "./routers/health.js"

/**
 * Root router - combines all domain routers
 */
export const appRouter = router({
  // Public endpoints (no auth required)
  health: healthRouter,
  auth: authRouter,
  customer: customerRouter,

  // Protected endpoints (auth required)
  merchant: merchantRouter,
})

export type AppRouter = typeof appRouter

/**
 * Export tRPC utilities and context type for use in consumers
 */
export { router, publicProcedure, procedure }
export { createContext } from "./context.js"
export type { Context } from "./context.js"
