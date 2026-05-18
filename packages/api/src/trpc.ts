import { initTRPC, TRPCError } from "@trpc/server"
import type { Context } from "./context.js"
import { authMiddleware, rateLimitMiddleware } from "./middleware.js"

const t = initTRPC.context<Context>().create()

export { t }
export const middleware = t.middleware
export const router = t.router

/**
 * Unprotected procedure
 */
export const publicProcedure = t.procedure.use(rateLimitMiddleware(t))

/**
 * Protected procedure - requires valid JWT
 */
export const procedure = t.procedure
  .use(rateLimitMiddleware(t))
  .use(authMiddleware(t))
  .use(async ({ ctx, next }) => {
    if (!ctx.shopId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      })
    }
    return next({
      ctx: { ...ctx, shopId: ctx.shopId },
    })
  })
