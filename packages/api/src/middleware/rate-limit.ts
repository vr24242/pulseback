import { t } from "../trpc.js"

/**
 * Rate limiting middleware
 * Placeholder for Redis-backed rate limiting
 * TODO: implement Redis-based rate limiting when Redis client is available
 */
export const rateLimitMiddleware = t.middleware(async ({ ctx, path, next }: any) => {
  // Rate limiting disabled in development
  // In production, implement Redis-based rate limiting:
  // const ip = ctx.ip || "unknown"
  // const key = `ratelimit:${ip}:${path}`
  // const count = await redis.incr(key)
  // if (count === 1) await redis.expire(key, 60)
  // if (count > 100) throw new TRPCError({ code: "TOO_MANY_REQUESTS" })

  return next()
})
