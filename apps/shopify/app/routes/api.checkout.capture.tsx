import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"

// Called by the Checkout UI Extension on every checkout session
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 })
  }

  try {
    const body = await request.json() as {
      phone?: string
      email?: string
      pincode?: string
      shopDomain: string
      checkoutToken?: string
      cartValue?: number
      utmSource?: string
      utmMedium?: string
      utmCampaign?: string
    }

    const { phone, email, pincode, shopDomain } = body

    // Find the shop
    const shop = await db.shop.findUnique({ where: { domain: shopDomain } })
    if (!shop) return json({ error: "Shop not found" }, { status: 404 })

    // Nothing to identify without contact info
    if (!phone && !email) return json({ ok: true, skipped: true })

    // ── Identity OS: resolve or create customer ──
    const customer = await resolveOrCreateCustomer({
      shopId: shop.id,
      phone: phone?.replace(/\D/g, "").slice(-10), // normalize to 10 digits
      email: email?.toLowerCase().trim(),
      pincode,
    })

    // ── Score RTO risk ──
    const rtoScore = scoreRTO(customer)

    // Update scores
    await db.customer.update({
      where: { id: customer.id },
      data: {
        rtoRiskScore: rtoScore,
        lastSeenAt: new Date(),
        pincode: pincode ?? customer.pincode,
      },
    })

    // ── Create/update checkout session ──
    if (body.checkoutToken) {
      await db.checkoutSession.upsert({
        where: { shopifyCheckoutToken: body.checkoutToken },
        create: {
          shopId: shop.id,
          customerId: customer.id,
          shopifyCheckoutToken: body.checkoutToken,
          cartValue: body.cartValue ?? 0,
          cartItems: [],
          phone,
          email,
          pincode,
          rtoRiskAtCheckout: rtoScore,
          codShown: rtoScore < (shop.rtoThreshold ?? 60),
          utmSource: body.utmSource,
          utmMedium: body.utmMedium,
          utmCampaign: body.utmCampaign,
          status: "active",
        },
        update: {
          customerId: customer.id,
          phone: phone ?? undefined,
          email: email ?? undefined,
          pincode: pincode ?? undefined,
          rtoRiskAtCheckout: rtoScore,
        },
      })
    }

    return json({
      ok: true,
      customerId: customer.id,
      rtoScore,
      codAllowed: rtoScore < (shop.rtoThreshold ?? 60),
    })
  } catch (err) {
    console.error("[checkout/capture]", err)
    // Never crash the checkout
    return json({ ok: true, error: "internal" })
  }
}

// ── Identity resolution: phone first, then email ──
async function resolveOrCreateCustomer(data: {
  shopId: string
  phone?: string
  email?: string
  pincode?: string
}) {
  const { shopId, phone, email, pincode } = data

  // 1. Try phone
  if (phone) {
    const existing = await db.customer.findUnique({
      where: { shopId_phone: { shopId, phone } },
    })
    if (existing) return existing
  }

  // 2. Try email
  if (email) {
    const existing = await db.customer.findUnique({
      where: { shopId_email: { shopId, email } },
    })
    if (existing) {
      // Enrich with phone if new
      if (phone && !existing.phone) {
        return db.customer.update({
          where: { id: existing.id },
          data: { phone },
        })
      }
      return existing
    }
  }

  // 3. Create new customer
  return db.customer.create({
    data: {
      shopId,
      phone: phone ?? null,
      email: email ?? null,
      pincode: pincode ?? null,
      lifecycleStage: "prospect",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  })
}

// ── Basic RTO scoring at checkout ──
function scoreRTO(customer: {
  totalOrders: number
  totalReturns: number
  returnRate: number
  rtoRiskScore: number
}): number {
  let score = customer.rtoRiskScore // start from existing score

  // New customer — moderate risk
  if (customer.totalOrders === 0) return Math.max(score, 30)

  // High return rate
  if (customer.returnRate > 0.5) score = Math.min(100, score + 30)
  if (customer.returnRate > 0.3) score = Math.min(100, score + 15)

  // Many returns
  if (customer.totalReturns > 3) score = Math.min(100, score + 20)

  return score
}
