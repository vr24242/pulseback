import { db } from "@d2c/database"
import { scoreRTO } from "../identity/scorer"

interface CheckoutDecision {
  showCOD: boolean
  rtoRiskScore: number
  discountCode?: string
  discountReason?: string
  upsellProductId?: string
  trustSignals: string[]
  shippingMessage?: string
}

// Called when identity is captured at checkout — returns real-time decisions
export async function getCheckoutDecision(input: {
  shopId: string
  customerId?: string
  phone?: string
  pincode?: string
  cartValue: number
  cartItems: Array<{ productId: string; quantity: number; price: number }>
  isReturningCustomer: boolean
  paymentMethod?: "cod" | "prepaid"
}): Promise<CheckoutDecision> {
  const shop = await db.shop.findUnique({ where: { id: input.shopId } })
  if (!shop) throw new Error("Shop not found")

  let customerHistory
  if (input.customerId) {
    customerHistory = await db.customer.findUnique({
      where: { id: input.customerId },
      select: { totalOrders: true, totalReturns: true, returnRate: true, rtoRiskScore: true },
    })
  }

  const rtoRiskScore = scoreRTO({
    pincode: input.pincode,
    paymentMethod: input.paymentMethod ?? "cod",
    orderValue: input.cartValue,
    customerHistory: customerHistory
      ? {
          totalOrders: customerHistory.totalOrders,
          totalRTOs: customerHistory.totalReturns,
          returnRate: customerHistory.returnRate,
        }
      : undefined,
  })

  const showCOD = shop.codEnabled && rtoRiskScore < shop.rtoThreshold

  const trustSignals = buildTrustSignals({
    isReturning: input.isReturningCustomer,
    cartValue: input.cartValue,
    rtoRisk: rtoRiskScore,
  })

  const upsellProductId = await selectUpsell(input.shopId, input.cartItems)

  let discountCode: string | undefined
  let discountReason: string | undefined

  // Incentivize prepaid when COD is risky
  if (rtoRiskScore >= 40 && rtoRiskScore < shop.rtoThreshold) {
    discountCode = "PREPAID50"
    discountReason = "Pay online, save ₹50"
  }

  return {
    showCOD,
    rtoRiskScore,
    discountCode,
    discountReason,
    upsellProductId: upsellProductId ?? undefined,
    trustSignals,
    shippingMessage: buildShippingMessage(input.pincode),
  }
}

function buildTrustSignals(input: {
  isReturning: boolean
  cartValue: number
  rtoRisk: number
}): string[] {
  const signals: string[] = []

  if (input.isReturning) signals.push("Welcome back! Your details are saved.")
  if (input.cartValue > 999) signals.push("Free shipping on this order")
  signals.push("Easy 7-day returns")
  signals.push("Secure checkout")

  return signals
}

async function selectUpsell(
  shopId: string,
  cartItems: Array<{ productId: string }>
): Promise<string | null> {
  // Placeholder: fetch from product recommendation engine
  // In production: query a product affinity table built from order history
  return null
}

function buildShippingMessage(pincode?: string): string {
  if (!pincode) return "Fast delivery across India"
  // In production: query carrier serviceability API for ETA
  return "Delivery in 3-5 business days"
}
