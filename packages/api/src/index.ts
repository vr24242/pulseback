import { router } from "./trpc.js"
import { merchantRouter } from "./routers/merchant.js"
import { customerRouter } from "./routers/customer.js"
import { authRouter } from "./routers/auth.js"

/**
 * Root app router
 */
export const appRouter = router({
  auth: authRouter,
  merchant: merchantRouter,
  customer: customerRouter,
})

export type AppRouter = typeof appRouter

// Re-export types and utilities
export type { Context } from "./context.js"
export { createContext, generateToken, verifyToken } from "./context.js"
export { publicProcedure, procedure, router } from "./trpc.js"
