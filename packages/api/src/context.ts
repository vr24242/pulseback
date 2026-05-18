import type { inferAsyncReturnType } from "@trpc/server"
import { db } from "@d2c/database"
import { SignJWT } from "jose"

/**
 * JWT Secret for token signing
 * In production, use environment variable
 */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production"
)

/**
 * Generate a signed JWT token for a shop
 */
export async function generateToken(
  shopId: string,
  expiresInHours: number = 24,
  customPayload?: Record<string, any>
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + expiresInHours * 60 * 60

  const token = await new SignJWT({
    shopId,
    iat: now,
    exp: expiresAt,
    ...customPayload,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(JWT_SECRET)

  return token
}

/**
 * Generate a tracking token for a customer
 * Used to create shareable tracking links
 */
export async function generateTrackingToken(
  shopId: string,
  customerId: string,
  phone: string,
  orderName: string,
  expiresInHours: number = 168 // 7 days
): Promise<string> {
  return generateToken(shopId, expiresInHours, {
    customerId,
    phone,
    orderName,
    type: "tracking",
  })
}

/**
 * Inner function for `createContext`
 */
export async function createContextInner() {
  return {
    db,
  }
}

/**
 * Create context function
 * Called on every request
 */
export async function createContext(opts: {
  headers: Headers | null
  ip?: string
  userAgent?: string
}) {
  const inner = await createContextInner()

  // Extract JWT from headers
  let shopId: string | null = null
  let shop: any | null = null

  const authHeader = opts.headers?.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    try {
      // Decode JWT (without verification for now, should verify in middleware)
      const parts = token.split(".")
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString())
        shopId = payload.shopId
        
        // Load shop from DB
        if (shopId) {
          shop = await db.shop.findUnique({ where: { id: shopId } })
        }
      }
    } catch (error) {
      // Silently fail — middleware will reject if needed
    }
  }

  return {
    ...inner,
    shopId,
    shop,
    ip: opts.ip,
    userAgent: opts.userAgent,
  }
}

export type Context = inferAsyncReturnType<typeof createContext>
