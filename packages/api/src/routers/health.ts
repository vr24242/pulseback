import { router, publicProcedure } from "../index"

export const healthRouter = router({
  check: publicProcedure.query(() => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
    }
  }),
})
