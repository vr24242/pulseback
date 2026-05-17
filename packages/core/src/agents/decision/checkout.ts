import { db } from "@d2c/database"
import type { CustomerMemory } from "../customer-memory"

/**
 * Checkout Decision Agent (Phase 2 Tier 3)
 *
 * Decides what offers and features to show to each customer at checkout.
 * Uses CustomerMemory to personalize the checkout experience.
 *
 * Decisions include:
 * - Whether to show BNPL options
 * - Whether to offer promo codes
 * - Whether to offer loyalty points redemption
 * - Whether to show gift wrap option
 * - What upsell products to recommend
 * - Whether to show first-order discount
 */

export interface CheckoutDecision {
  showBNPL: boolean // show BNPL options?
  bnplRecommendation?: string // "3 months 0%" if shown
  showLoyalty: boolean // show loyalty points redemption?
  loyaltyRecommendation?: {
    availablePoints: number
    potentialDiscount: number
  }
  showPromoCode: boolean // show promo code field?
  suggestedPromos?: Array<{ code: string; discount: string }>
  showGiftWrap: boolean // show gift wrap option?
  showUpsells: boolean // show product recommendations?
  upsellProducts?: Array<{ id: string; title: string; reason: string }>
  applyFirstOrderDiscount: boolean
  firstOrderDiscountPercent?: number
  reasoning: string
}

/**
 * Main decision function
 */
export async function decideCheckout(
  memory: CustomerMemory,
  cartValue: number,
  shopId: string
): Promise<CheckoutDecision> {
  const isFirstOrder = memory.totalOrders === 0
  const isHighValue = cartValue >= 5000 // ₹5000+
  const isVIP = memory.ltvTier === "vip"

  // Decisions are conservative by default — only show if it improves UX
  const decision: CheckoutDecision = {
    showBNPL: false,
    showLoyalty: false,
    showPromoCode: true, // always show promo code field
    showGiftWrap: cartValue > 1000, // only for ₹1000+ orders
    showUpsells: true,
    applyFirstOrderDiscount: false,
    reasoning: "",
  }

  // ─── BNPL Decision ───
  // Show for: high-value orders (₹5000+) or loyal customers
  if (isHighValue || (memory.totalOrders >= 2 && memory.ltvTier !== "low")) {
    decision.showBNPL = true
    decision.bnplRecommendation = cartValue >= 15000 ? "3 months 0%" : "Not applicable"
  }

  // ─── Loyalty Points Decision ───
  // Show for: customers with points, loyalty tier mid+ (not first-time buyers)
  if (memory.totalOrders > 0) {
    const loyaltyPoints = await db.customerLoyaltyPoints.findUnique({
      where: { customerId: memory.customerId },
    })

    if (loyaltyPoints && loyaltyPoints.availablePoints >= 100) {
      decision.showLoyalty = true
      // Rough estimate: 100 points ≈ ₹10-20 discount
      decision.loyaltyRecommendation = {
        availablePoints: loyaltyPoints.availablePoints,
        potentialDiscount: Math.floor(loyaltyPoints.availablePoints / 10),
      }
    }
  }

  // ─── Promo Code Decision ───
  // Always show. Never push — let customer decide
  decision.showPromoCode = true

  // ─── Gift Wrap Decision ───
  // Show for orders > ₹1000
  decision.showGiftWrap = cartValue > 1000

  // ─── Upsell Decision ───
  // Show for: not at-risk, not after 2 upsells this week
  const recentUpsells = memory.recentComms.filter(
    (c) => c.type === "post_purchase_upsell" && c.sentAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length

  decision.showUpsells = memory.churnScore < 70 && recentUpsells < 2

  // ─── First-Order Discount Decision ───
  // Show for: first-time buyers, not VIP (VIP gets different treatment)
  if (isFirstOrder && !isVIP) {
    decision.applyFirstOrderDiscount = true
    decision.firstOrderDiscountPercent = 10 // 10% first-order discount
  }

  // ─── Build Reasoning ───
  const reasons: string[] = []
  if (decision.showBNPL) reasons.push("High-value order, BNPL shown")
  if (decision.showLoyalty) reasons.push("Loyalty points available for redemption")
  if (isFirstOrder && decision.applyFirstOrderDiscount)
    reasons.push("First-time buyer, 10% discount applied")
  if (decision.showGiftWrap) reasons.push("Gift wrap option shown for order > ₹1000")

  decision.reasoning = reasons.length > 0 ? reasons.join("; ") : "Standard checkout experience"

  return decision
}

/**
 * Validate checkout inputs before completing order
 */
export async function validateCheckoutCompletion(
  memory: CustomerMemory,
  cartValue: number,
  promoCodeUsed?: string,
  loyaltyPointsRedeemed?: number,
  bnplPlanId?: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []

  // ─── Promo Code Validation ───
  if (promoCodeUsed) {
    const promoCode = await db.promoCode.findUnique({
      where: { code: promoCodeUsed },
    })

    if (!promoCode) {
      errors.push("Invalid promo code")
    } else if (new Date() > promoCode.validUntil) {
      errors.push("Promo code expired")
    }
  }

  // ─── Loyalty Points Validation ───
  if (loyaltyPointsRedeemed && loyaltyPointsRedeemed > 0) {
    const loyaltyRecord = await db.customerLoyaltyPoints.findUnique({
      where: { customerId: memory.customerId },
    })

    if (!loyaltyRecord || loyaltyRecord.availablePoints < loyaltyPointsRedeemed) {
      errors.push("Insufficient loyalty points")
    }
  }

  // ─── BNPL Plan Validation ───
  if (bnplPlanId) {
    const plan = await db.bNPLPlan.findUnique({
      where: { id: bnplPlanId },
    })

    if (!plan || !plan.enabled) {
      errors.push("BNPL plan not available")
    } else if (cartValue < plan.minOrderValue) {
      errors.push(`Minimum order value ₹${plan.minOrderValue} required for this plan`)
    }
  }

  // ─── RTO Check ───
  if (memory.rtoRiskScore > 80) {
    errors.push("Order cannot be completed — high fraud risk detected")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Calculate final checkout amounts with all discounts
 */
export async function calculateFinalCheckout(
  cartValue: number,
  memory: CustomerMemory,
  options: {
    promoCode?: string
    loyaltyPointsToRedeem?: number
    bnplPlanId?: string
    giftWrapSelected?: boolean
  }
): Promise<{
  subtotal: number
  promoDiscount: number
  loyaltyDiscount: number
  giftWrap: number
  shipping: number
  tax: number
  total: number
  savings: number
}> {
  let promoDiscount = 0
  let loyaltyDiscount = 0
  let giftWrap = 0

  // ─── Promo Code Discount ───
  if (options.promoCode) {
    const promo = await db.promoCode.findUnique({
      where: { code: options.promoCode },
    })

    if (promo) {
      promoDiscount =
        promo.discountType === "percentage"
          ? (cartValue * promo.discountValue) / 100
          : promo.discountValue
    }
  }

  // ─── Loyalty Points Discount ───
  if (options.loyaltyPointsToRedeem && options.loyaltyPointsToRedeem > 0) {
    const program = await db.loyaltyProgram.findFirst({})
    if (program) {
      loyaltyDiscount = (options.loyaltyPointsToRedeem / program.redeemPointsValue) * 100
    }
  }

  // ─── Gift Wrap ───
  if (options.giftWrapSelected) {
    giftWrap = 50 // ₹50 for gift wrap
  }

  // ─── Shipping (simplified - would call Shiprocket API) ───
  const shipping = cartValue > 500 ? 0 : 50 // free shipping > ₹500

  // ─── Tax (18% GST) ───
  const taxableAmount = cartValue - promoDiscount - loyaltyDiscount
  const tax = Math.round(taxableAmount * 0.18)

  const subtotal = cartValue
  const total = subtotal - promoDiscount - loyaltyDiscount + giftWrap + shipping + tax
  const savings = promoDiscount + loyaltyDiscount

  return {
    subtotal: Math.round(subtotal),
    promoDiscount: Math.round(promoDiscount),
    loyaltyDiscount: Math.round(loyaltyDiscount),
    giftWrap,
    shipping,
    tax,
    total: Math.round(total),
    savings: Math.round(savings),
  }
}
