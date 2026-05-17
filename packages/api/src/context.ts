import * as jose from "jose"
import { db } from "@d2c/database"

const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production"
const secret = new TextEncoder().encode(JWT_SECRET)

export interface PulseJWTPayload {
  shopId: string
  shopDomain: string
  exp: number
  iat: number
}

export interface Context {
  shopId?: string
  shop?: any
  headers: Record<string, string>
}

/**
 * Verify JWT token and extract shopId
 */
export async function verifyToken(token: string): Promise<PulseJWTPayload> {
  try {
    const verified = await jose.jwtVerify(token, secret)
    return verified.payload as unknown as PulseJWTPayload
  } catch (err) {
    throw new Error("Invalid or expired token")
  }
}

/**
 * Generate JWT token for a shop
 */
export async function generateToken(shopId: string, expiresInHours = 24): Promise<string> {
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } })

  const payload: PulseJWTPayload = {
    shopId,
    shopDomain: shop.domain,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInHours * 60 * 60,
  }

  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .sign(secret)
}

/**
 * Create context from request headers
 */
export async function createContext(headers: Record<string, string>): Promise<Context> {
  const ctx: Context = { headers }

  try {
    const authHeader = headers.authorization || headers.Authorization
    if (!authHeader) return ctx

    const token = authHeader.replace(/^Bearer\s+/i, "")
    const payload = await verifyToken(token)

    const shop = await db.shop.findUnique({ where: { id: payload.shopId } })
    if (!shop) throw new Error("Shop not found")

    ctx.shopId = payload.shopId
    ctx.shop = shop
  } catch (err) {
    // No token or invalid token — proceed with public context
  }

  return ctx
}
