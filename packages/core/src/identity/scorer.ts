// High-RTO pincodes (seed this from real data over time)
const HIGH_RTO_PINCODES = new Set<string>([])

interface RTOInput {
  pincode?: string
  paymentMethod: "cod" | "prepaid"
  orderValue: number
  customerHistory?: {
    totalOrders: number
    totalRTOs: number
    returnRate: number
  }
}

export function scoreRTO(input: RTOInput): number {
  let score = 0

  // Prepaid = zero RTO risk
  if (input.paymentMethod === "prepaid") return 0

  // COD base risk
  score += 25

  // High-value COD orders riskier
  if (input.orderValue > 3000) score += 20
  else if (input.orderValue > 1500) score += 10

  // Known high-RTO pincode
  if (input.pincode && HIGH_RTO_PINCODES.has(input.pincode)) score += 25

  // Customer's own history is the strongest signal
  if (input.customerHistory && input.customerHistory.totalOrders > 0) {
    const customerRtoRate =
      input.customerHistory.totalRTOs / input.customerHistory.totalOrders
    score += Math.round(customerRtoRate * 40)

    // High return rate is a proxy for RTO tendency
    score += Math.round(input.customerHistory.returnRate * 15)
  } else {
    // No history = new customer COD = moderate risk
    score += 10
  }

  return Math.min(100, score)
}

export function scoreChurn(input: {
  daysSinceLastOrder: number
  avgOrderFrequencyDays: number
  emailOpenRate: number
  whatsappResponseRate: number
  recentSupportTickets: number
  returnRate: number
}): number {
  let score = 0

  const overdueFactor =
    input.daysSinceLastOrder / Math.max(input.avgOrderFrequencyDays, 1)

  if (overdueFactor > 3) score += 40
  else if (overdueFactor > 2) score += 25
  else if (overdueFactor > 1.5) score += 15

  // Low engagement signals churn
  if (input.emailOpenRate < 0.05) score += 15
  if (input.whatsappResponseRate < 0.1) score += 10

  // Support friction predicts churn
  if (input.recentSupportTickets > 2) score += 15
  if (input.returnRate > 0.3) score += 10

  return Math.min(100, score)
}

export function scoreFraud(input: {
  orderValue: number
  isNewCustomer: boolean
  paymentMethod: "cod" | "prepaid"
  pincode?: string
  sameAddressDifferentPhones?: number  // suspicious signal
}): number {
  let score = 0

  if (input.paymentMethod === "cod" && input.orderValue > 5000) score += 30
  if (input.isNewCustomer && input.orderValue > 3000) score += 20
  if (input.sameAddressDifferentPhones && input.sameAddressDifferentPhones > 3) score += 40

  return Math.min(100, score)
}

export function determineLtvTier(ltv: number, totalOrders: number): string {
  if (totalOrders === 0) return "new"
  if (ltv > 15000 && totalOrders >= 5) return "vip"
  if (ltv > 5000 || totalOrders >= 4) return "loyal"
  if (totalOrders >= 2) return "growing"
  return "new"
}
