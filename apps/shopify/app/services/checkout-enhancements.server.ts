import { db } from "@d2c/database"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

/**
 * Loyalty Points Service
 * Awards points on orders, tracks redemption
 */
export async function awardLoyaltyPoints(
  customerId: string,
  orderAmount: number, // in ₹
  shopId: string
): Promise<{ pointsAwarded: number; totalPoints: number }> {
  const program = await db.loyaltyProgram.findUnique({
    where: { shopId },
  })

  if (!program || !program.enabled) {
    return { pointsAwarded: 0, totalPoints: 0 }
  }

  const pointsAwarded = Math.floor(orderAmount * program.pointsPerRupee)

  // Get or create loyalty points record
  let loyaltyRecord = await db.customerLoyaltyPoints.findUnique({
    where: { customerId },
  })

  if (!loyaltyRecord) {
    loyaltyRecord = await db.customerLoyaltyPoints.create({
      data: { customerId, totalPoints: pointsAwarded, availablePoints: pointsAwarded },
    })
  } else {
    loyaltyRecord = await db.customerLoyaltyPoints.update({
      where: { customerId },
      data: {
        totalPoints: loyaltyRecord.totalPoints + pointsAwarded,
        availablePoints: loyaltyRecord.availablePoints + pointsAwarded,
        lastPointsAddedAt: new Date(),
      },
    })
  }

  return { pointsAwarded, totalPoints: loyaltyRecord.totalPoints }
}

export async function redeemLoyaltyPoints(
  customerId: string,
  pointsToRedeem: number,
  shopId: string
): Promise<{ discountAmount: number; pointsRemaining: number } | { error: string }> {
  const program = await db.loyaltyProgram.findUnique({
    where: { shopId },
  })

  if (!program || !program.enabled) {
    return { error: "Loyalty program not enabled" }
  }

  const loyaltyRecord = await db.customerLoyaltyPoints.findUnique({
    where: { customerId },
  })

  if (!loyaltyRecord || loyaltyRecord.availablePoints < pointsToRedeem) {
    return { error: "Insufficient loyalty points" }
  }

  const discountAmount = (pointsToRedeem / program.redeemPointsValue) * 100 // points to ₹

  await db.customerLoyaltyPoints.update({
    where: { customerId },
    data: {
      availablePoints: loyaltyRecord.availablePoints - pointsToRedeem,
      redeemedPoints: loyaltyRecord.redeemedPoints + pointsToRedeem,
      lastPointsRedeemedAt: new Date(),
    },
  })

  return { discountAmount, pointsRemaining: loyaltyRecord.availablePoints - pointsToRedeem }
}

export async function getCustomerLoyaltyBalance(customerId: string) {
  const loyaltyRecord = await db.customerLoyaltyPoints.findUnique({
    where: { customerId },
  })

  return {
    totalPoints: loyaltyRecord?.totalPoints || 0,
    availablePoints: loyaltyRecord?.availablePoints || 0,
    redeemedPoints: loyaltyRecord?.redeemedPoints || 0,
  }
}

/**
 * Promo Code Service
 */
export async function validatePromoCode(
  code: string,
  customerId: string,
  cartValue: number,
  shopId: string,
  isFirstOrder: boolean
): Promise<{ valid: boolean; discount?: number; error?: string }> {
  const promoCode = await db.promoCode.findUnique({
    where: { code },
  })

  if (!promoCode || promoCode.shopId !== shopId) {
    return { valid: false, error: "Invalid promo code" }
  }

  // Check dates
  const now = new Date()
  if (now < promoCode.validFrom || now > promoCode.validUntil) {
    return { valid: false, error: "Promo code expired" }
  }

  // Check redemption limit
  if (promoCode.maxRedemptions && promoCode.redemptions >= promoCode.maxRedemptions) {
    return { valid: false, error: "Promo code limit reached" }
  }

  // Check first-order restriction
  if (promoCode.applicableOnFirstOrder && !isFirstOrder) {
    return { valid: false, error: "This code is only for first-time customers" }
  }

  // Check minimum order value
  if (promoCode.minOrderValue && cartValue < promoCode.minOrderValue) {
    return {
      valid: false,
      error: `Minimum order value ₹${promoCode.minOrderValue} required`,
    }
  }

  // Check usage per customer
  const customerUsages = await db.checkoutSession.findMany({
    where: { customerId, promoCodeUsed: code, status: "completed" },
  })

  if (customerUsages.length >= promoCode.maxUsesPerCustomer) {
    return { valid: false, error: "You've already used this code" }
  }

  // Calculate discount
  const discountAmount =
    promoCode.discountType === "percentage"
      ? (cartValue * promoCode.discountValue) / 100
      : promoCode.discountValue

  return { valid: true, discount: discountAmount }
}

export async function applyPromoCode(codeId: string): Promise<void> {
  await db.promoCode.update({
    where: { id: codeId },
    data: { redemptions: { increment: 1 } },
  })
}

/**
 * First-Order Discount
 */
export async function getFirstOrderDiscount(customerId: string, shopId: string): Promise<number> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
  })

  if (!customer || customer.totalOrders > 0) {
    return 0 // Not a first-time buyer
  }

  // Find first-order discount promo
  const firstOrderPromo = await db.promoCode.findFirst({
    where: {
      shopId,
      applicableOnFirstOrder: true,
      enabled: true, // Assuming we add this field
    },
  })

  if (!firstOrderPromo) {
    return 0
  }

  const discountAmount =
    firstOrderPromo.discountType === "percentage"
      ? 15 // Default 15% for first-order discounts
      : firstOrderPromo.discountValue

  return discountAmount
}

/**
 * BNPL / Subscription Plans
 */
export async function getBNPLPlans(
  shopId: string,
  cartValue: number
): Promise<Array<{ id: string; name: string; months: number; interestRate: number }>> {
  const plans = await db.bNPLPlan.findMany({
    where: {
      shopId,
      enabled: true,
      minOrderValue: { lte: cartValue },
      OR: [{ maxOrderValue: null }, { maxOrderValue: { gte: cartValue } }],
    },
  })

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    months: plan.months,
    interestRate: plan.interestRate,
  }))
}

export async function initiateBNPLSubscription(
  orderId: string,
  customerId: string,
  planId: string,
  amount: number
): Promise<{ subscriptionId: string; nextPaymentDate: Date } | { error: string }> {
  // This would integrate with Razorpay Subscriptions API
  // For now, returning a placeholder
  // TODO: Implement Razorpay subscription creation

  const plan = await db.bNPLPlan.findUnique({
    where: { id: planId },
  })

  if (!plan) {
    return { error: "Plan not found" }
  }

  // Simulate Razorpay subscription creation
  const subscriptionId = `sub_${Date.now()}`
  const nextPaymentDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  return { subscriptionId, nextPaymentDate }
}

/**
 * Gift Wrap Service
 */
export const GIFT_WRAP_PRICE = 50 // ₹50

export function getGiftWrapPrice(): number {
  return GIFT_WRAP_PRICE
}

/**
 * Upsell / Cross-Sell Recommendations
 * Uses AI to recommend products based on cart items
 */
export async function recommendUpsellProducts(
  cartItems: Array<{ productId: string; title: string; price: number }>,
  shopId: string
): Promise<Array<{ productId: string; title: string; reason: string }>> {
  if (cartItems.length === 0) {
    return []
  }

  const itemTitles = cartItems.map((item) => item.title).join(", ")

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Customer is buying: ${itemTitles}.

Suggest 1-2 complementary product types they might want (just product categories, no brand names).
Format: category1, category2

Be specific but brief.`,
        },
      ],
    })

    const suggestions = response.content[0].type === "text" ? response.content[0].text : ""

    // Parse suggestions and return as mock recommendations
    // In production, would query the store's products
    const categories = suggestions.split(",").map((s) => s.trim())

    return categories.slice(0, 2).map((cat, idx) => ({
      productId: `upsell_${idx}`,
      title: cat,
      reason: "Complements your purchase",
    }))
  } catch (error) {
    console.error("Error generating upsell recommendations:", error)
    return []
  }
}

/**
 * Calculate Total Checkout Summary
 */
export async function calculateCheckoutSummary(
  checkoutSessionId: string,
  customerId: string,
  shopId: string
): Promise<{
  subtotal: number
  promoDiscount: number
  loyaltyDiscount: number
  giftWrap: number
  shipping: number
  tax: number
  savings: number
  total: number
}> {
  const session = await db.checkoutSession.findUnique({
    where: { id: checkoutSessionId },
  })

  if (!session) {
    return {
      subtotal: 0,
      promoDiscount: 0,
      loyaltyDiscount: 0,
      giftWrap: 0,
      shipping: 0,
      tax: 0,
      savings: 0,
      total: 0,
    }
  }

  const subtotal = session.cartValue
  const promoDiscount = session.promoDiscountAmount || 0
  const loyaltyDiscount = (session.loyaltyDiscountAmount || 0) * 100 // Convert from ₹ to paise equivalent
  const giftWrap = session.giftWrapPrice || 0
  const shipping = session.shippingCost || 0
  const tax = Math.round((subtotal - promoDiscount - loyaltyDiscount) * 0.18) // 18% GST

  const savings = promoDiscount + loyaltyDiscount
  const total = subtotal - promoDiscount - loyaltyDiscount + giftWrap + shipping + tax

  return {
    subtotal: Math.round(subtotal),
    promoDiscount: Math.round(promoDiscount),
    loyaltyDiscount: Math.round(loyaltyDiscount),
    giftWrap: Math.round(giftWrap),
    shipping: Math.round(shipping),
    tax: Math.round(tax),
    savings: Math.round(savings),
    total: Math.round(total),
  }
}
