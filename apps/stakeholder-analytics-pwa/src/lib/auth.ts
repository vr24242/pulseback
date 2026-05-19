import * as jose from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.VITE_JWT_SECRET || 'dev-secret-key-change-in-production'
)

export interface StakeholderToken {
  shopId: string
  stakeholderId?: string
  exp: number
  permissions: string[]
  email?: string
}

export function decodeToken(token: string): StakeholderToken | null {
  try {
    // For demo: do client-side decode without verification (server verified at generation)
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    if (payload.exp * 1000 < Date.now()) return null // expired
    return payload as StakeholderToken
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return localStorage.getItem('stakeholder_token')
}

export function setToken(token: string): void {
  localStorage.setItem('stakeholder_token', token)
}

export function clearToken(): void {
  localStorage.removeItem('stakeholder_token')
}

export function isTokenValid(): boolean {
  const token = getToken()
  if (!token) return false
  const decoded = decodeToken(token)
  return decoded !== null
}

export function getTokenClaims(): StakeholderToken | null {
  const token = getToken()
  if (!token) return null
  return decodeToken(token)
}
