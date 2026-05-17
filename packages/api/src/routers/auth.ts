import { publicProcedure, router } from "../trpc.js"
import { generateToken } from "../context.js"
import { z } from "zod"

export const authRouter = router({
  /**
   * Generate JWT token for a merchant shop
   */
  generateToken: publicProcedure
    .input(
      z.object({
        shopId: z.string(),
        expiresInHours: z.number().default(24).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // In production, you'd verify the shopId belongs to authenticated user
      // For now, assuming this is called from a secure context (Remix server-side)
      const token = await generateToken(input.shopId, input.expiresInHours)

      return {
        token,
        expiresIn: (input.expiresInHours || 24) * 60 * 60,
        type: "Bearer",
      }
    }),

  /**
   * Refresh an existing token
   */
  refreshToken: publicProcedure
    .input(
      z.object({
        token: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Extract shopId from current token in headers
      if (!ctx.shopId) {
        throw new Error("No active session to refresh")
      }

      const token = await generateToken(ctx.shopId, 24)

      return {
        token,
        expiresIn: 24 * 60 * 60,
        type: "Bearer",
      }
    }),

  /**
   * Health check
   */
  health: publicProcedure.query(() => {
    return {
      status: "ok",
      timestamp: new Date(),
    }
  }),
})
