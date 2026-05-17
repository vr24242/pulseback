const TOKEN_KEY = "pulseback_jwt"
const TOKEN_EXPIRY_KEY = "pulseback_jwt_expiry"

export interface JWTPayload {
  shopId: string
  shopDomain: string
  exp: number
  iat: number
}

/**
 * Store JWT token in localStorage
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

/**
 * Get JWT token from localStorage
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * Remove JWT token from localStorage
 */
export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
}

/**
 * Decode JWT payload without verification (client-side only)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    const payload = JSON.parse(atob(parts[1]))
    return payload as JWTPayload
  } catch {
    return null
  }
}

/**
 * Check if token is valid and not expired
 */
export function isTokenValid(): boolean {
  const token = getToken()
  if (!token) return false

  const payload = decodeToken(token)
  if (!payload) return false

  // Check if expired (exp is in seconds)
  const now = Math.floor(Date.now() / 1000)
  return payload.exp > now
}

/**
 * Get remaining time before token expires (in seconds)
 */
export function getTokenExpiryIn(): number {
  const token = getToken()
  if (!token) return 0

  const payload = decodeToken(token)
  if (!payload) return 0

  const now = Math.floor(Date.now() / 1000)
  return Math.max(0, payload.exp - now)
}

/**
 * Extract shopId from token
 */
export function getShopId(): string | null {
  const token = getToken()
  if (!token) return null

  const payload = decodeToken(token)
  return payload?.shopId || null
}
