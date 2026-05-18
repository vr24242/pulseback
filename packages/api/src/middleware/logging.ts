import { t } from "../index"

/**
 * Logging middleware - logs all tRPC calls
 */
export const loggingMiddleware = t.middleware(async ({ path, type, next, input }) => {
  const start = Date.now()

  const result = await next()

  const durationMs = Date.now() - start
  console.log(`[tRPC] ${type} ${path} (${durationMs}ms)`, {
    ok: result.ok,
  })

  return result
})
