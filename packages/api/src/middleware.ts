import { Redis } from "ioredis"

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379")

export const authMiddleware = (t: any) => {
  return t.middleware(async ({ ctx, next }: any) => {
    const authHeader = (ctx as any).headers?.authorization || (ctx as any).headers?.Authorization

    if (!authHeader) {
      throw new Error("Missing authorization header")
    }

    if (!(ctx as any).shopId) {
      throw new Error("Unauthorized: Invalid or expired token")
    }

    return next({
      ctx: { ...ctx, authenticated: true },
    })
  })
}

export const rateLimitMiddleware = (t: any) => {
  return t.middleware(async ({ ctx, path, next }: any) => {
    if (!ctx.shopId) {
      // Public endpoints: less strict limit
      const key = `rl:public:${path}:${ctx.headers?.["x-forwarded-for"] || "unknown"}`
      const result = await redis.incr(key)

      if (result === 1) await redis.expire(key, 60)
      if (result > 60) {
        // 60 requests per minute for public
        throw new Error("Rate limit exceeded")
      }
    } else {
      // Authenticated endpoints: higher limit
      const key = `rl:${ctx.shopId}:${path}`
      const result = await redis.incr(key)

      if (result === 1) await redis.expire(key, 60)
      if (result > 100) {
        // 100 requests per minute for authenticated
        throw new Error("Rate limit exceeded")
      }
    }

    return next()
  })
}
