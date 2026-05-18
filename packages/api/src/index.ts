/**
 * PulseOS tRPC API
 * Unified API layer for all web surfaces (PWAs, dashboards, etc.)
 *
 * Routers:
 * - public: unauthenticated endpoints (customer tracking, returns initiation)
 * - merchant: authenticated merchant endpoints (orders, customers, exceptions, approvals)
 */

import { initTRPC } from "@trpc/server"
import { ZodError } from "zod"
import type { Context } from "./context"
import { merchantRouter } from "./routers/merchant"
import { customerRouter } from "./routers/customer"
import { authRouter } from "./routers/auth"
import { healthRouter } from "./routers/health"

/**
 * Create tRPC instance
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

/**
 * Export tRPC utilities for use in middleware
 */
export { t }

/**
 * Middleware setup
 */
import { loggingMiddleware } from "./middleware/logging"
import { rateLimitMiddleware } from "./middleware/rate-limit"

/**
 * Procedure types
 */
export const router = t.router
export const publicProcedure = t.procedure
  .use(loggingMiddleware)
  .use(rateLimitMiddleware)

/**
 * Protected procedures (requires valid JWT)
 */
import { authMiddleware } from "./middleware/auth"

export const protectedProcedure = publicProcedure
  .use(authMiddleware)

/**
 * Root router
 */
export const appRouter = t.router({
  // Public endpoints (no auth required)
  health: healthRouter,
  auth: authRouter,
  customer: customerRouter,

  // Protected endpoints (auth required)
  merchant: merchantRouter,
})

export type AppRouter = typeof appRouter

/**
 * Export context type for use in middleware/resolvers
 */
export type { Context } from "./context"
