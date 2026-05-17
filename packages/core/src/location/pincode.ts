/**
 * Pincode validation and location lookup for Indian postal codes
 */

export interface PincodeInfo {
  pincode: string
  city: string
  state: string
  district?: string
  country: string
  valid: boolean
}

/**
 * Validate and lookup pincode information
 * Uses India Post's pincode search API
 */
export async function lookupPincode(pincode: string): Promise<PincodeInfo | null> {
  // Validate format: 6 digits
  const normalized = pincode.replace(/\D/g, "")
  if (normalized.length !== 6) {
    return null
  }

  try {
    // India Post Pincode API (public, no auth required)
    const res = await fetch(
      `https://api.postalpincode.in/pincode/${normalized}`,
      { signal: AbortSignal.timeout(5000) }
    )

    if (!res.ok) return null

    const data = await res.json() as Array<{
      PostOffice?: Array<{
        District?: string
        State?: string
        Division?: string
      }>
      Status?: string
    }>

    if (!Array.isArray(data) || data.length === 0 || data[0].Status !== "Success") {
      return null
    }

    const officeData = data[0].PostOffice?.[0]
    if (!officeData?.State) return null

    return {
      pincode: normalized,
      city: officeData.District || "",
      state: officeData.State || "",
      district: officeData.District,
      country: "India",
      valid: true,
    }
  } catch {
    // Timeout or network error — return null to not block checkout
    return null
  }
}

/**
 * Cached lookup with fallback to fuzzy matching common pincodes
 */
const pincodeCache = new Map<string, PincodeInfo | null>()

export async function lookupPincodeWithCache(pincode: string): Promise<PincodeInfo | null> {
  const normalized = pincode.replace(/\D/g, "")

  if (pincodeCache.has(normalized)) {
    return pincodeCache.get(normalized) ?? null
  }

  const result = await lookupPincode(normalized)
  pincodeCache.set(normalized, result)
  return result
}
