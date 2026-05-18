/**
 * Token generation utilities for PulseOS
 */

import { SignJWT } from "jose"

/**
 * JWT Secret for token signing
 * In production, use environment variable
 */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production"
)

/**
 * Generate a tracking token for customer order tracking
 * Used in WhatsApp links: https://pulseback.app/auth?jwt={{token}}
 */
export async function generateTrackingToken(
  shopId: string,
  customerId: string,
  phone: string,
  orderName: string,
  expiresInHours: number = 168 // 7 days
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + expiresInHours * 60 * 60

  const token = await new SignJWT({
    shopId,
    customerId,
    phone,
    orderName,
    type: "tracking",
    iat: now,
    exp: expiresAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(JWT_SECRET)

  return token
}

/**
 * Generate tracking URL for customer
 */
export async function generateTrackingUrl(
  shopId: string,
  customerId: string,
  phone: string,
  orderName: string,
  baseUrl: string = "https://pulseback.app"
): Promise<string> {
  const token = await generateTrackingToken(shopId, customerId, phone, orderName)
  return `${baseUrl}/auth?jwt=${encodeURIComponent(token)}`
}
