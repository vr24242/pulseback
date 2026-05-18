import { t } from "../index"
import { TRPCError } from "@trpc/server"

/**
 * Authentication middleware
 * Validates JWT and ensures shopId is present
 */
export const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.shopId || !ctx.shop) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    })
  }

  return next()
})
