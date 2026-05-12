export type LtvTier = "new" | "growing" | "loyal" | "vip" | "lapsed"

export type LifecycleStage =
  | "prospect"
  | "first_buyer"
  | "repeat"
  | "loyal"
  | "vip"
  | "at_risk"
  | "lapsed"

export type ConsentChannel = "whatsapp" | "email" | "sms"

export interface CustomerProfile {
  id: string
  shopId: string

  // Identity
  phone?: string
  email?: string
  name?: string
  shopifyCustomerId?: string
  identityConfidence: number // 0-1

  // Location
  city?: string
  state?: string
  pincode?: string
  country: string

  // Acquisition
  acquisitionSource?: string
  acquisitionCampaign?: string
  acquisitionMedium?: string
  firstSeenAt: Date
  lastSeenAt: Date

  // Scores
  rtoRiskScore: number   // 0-100
  fraudScore: number     // 0-100
  churnScore: number     // 0-100
  ltv: number
  ltvTier: LtvTier

  // Order stats
  totalOrders: number
  totalSpend: number
  averageOrderValue: number
  lastOrderAt?: Date
  expectedNextOrderAt?: Date

  // Return stats
  totalReturns: number
  returnRate: number

  // Consent
  whatsappOptIn: boolean
  emailOptIn: boolean
  smsOptIn: boolean

  // Engagement
  emailOpenRate: number
  whatsappResponseRate: number
  lastEngagedAt?: Date

  // Lifecycle
  lifecycleStage: LifecycleStage

  createdAt: Date
  updatedAt: Date
}

export interface CustomerIdentityInput {
  phone?: string
  email?: string
  name?: string
  pincode?: string
  shopId: string
  shopifyCustomerId?: string
  acquisitionSource?: string
  acquisitionCampaign?: string
  acquisitionMedium?: string
}
