import { db } from "@d2c/database"
import type { CustomerIdentityInput, CustomerProfile } from "@d2c/shared"
import { scoreRTO } from "./scorer"

// Primary entry point — called every time a phone/email hits checkout
export async function resolveIdentity(
  input: CustomerIdentityInput
): Promise<{ customer: CustomerProfile; isNew: boolean }> {
  const { shopId, phone, email, shopifyCustomerId } = input

  // Look up by phone first (most reliable), then email, then Shopify ID
  let existing = null

  if (phone) {
    existing = await db.customer.findUnique({ where: { shopId_phone: { shopId, phone } } })
  }
  if (!existing && email) {
    existing = await db.customer.findUnique({ where: { shopId_email: { shopId, email } } })
  }
  if (!existing && shopifyCustomerId) {
    existing = await db.customer.findUnique({
      where: { shopId_shopifyCustomerId: { shopId, shopifyCustomerId } },
    })
  }

  if (existing) {
    // Returning customer — update any new fields and lastSeenAt
    const updated = await db.customer.update({
      where: { id: existing.id },
      data: {
        phone: phone ?? existing.phone,
        email: email ?? existing.email,
        name: input.name ?? existing.name,
        pincode: input.pincode ?? existing.pincode,
        shopifyCustomerId: shopifyCustomerId ?? existing.shopifyCustomerId,
        lastSeenAt: new Date(),
        identityConfidence: computeConfidence({ phone, email, shopifyCustomerId }),
      },
    })
    return { customer: updated as unknown as CustomerProfile, isNew: false }
  }

  // New customer — create profile and begin scoring
  const rtoRiskScore = scoreRTO({
    pincode: input.pincode,
    paymentMethod: "cod",  // assume COD until order placed
    orderValue: 0,
  })

  const created = await db.customer.create({
    data: {
      shopId,
      phone,
      email,
      name: input.name,
      pincode: input.pincode,
      shopifyCustomerId,
      acquisitionSource: input.acquisitionSource,
      acquisitionCampaign: input.acquisitionCampaign,
      acquisitionMedium: input.acquisitionMedium,
      identityConfidence: computeConfidence({ phone, email, shopifyCustomerId }),
      rtoRiskScore,
      whatsappOptIn: !!phone,  // capturing phone = implicit WhatsApp opt-in intent
    },
  })

  return { customer: created as unknown as CustomerProfile, isNew: true }
}

// Merge two identity records (anonymous → known)
export async function mergeIdentities(
  anonymousId: string,
  knownId: string
): Promise<void> {
  // Move all relations from anonymous to known customer
  await Promise.all([
    db.checkoutSession.updateMany({
      where: { customerId: anonymousId },
      data: { customerId: knownId },
    }),
    db.timelineEvent.updateMany({
      where: { customerId: anonymousId },
      data: { customerId: knownId },
    }),
  ])

  await db.customer.delete({ where: { id: anonymousId } })
}

function computeConfidence(identity: {
  phone?: string
  email?: string
  shopifyCustomerId?: string
}): number {
  let score = 0
  if (identity.phone) score += 0.5             // phone is strongest signal
  if (identity.email) score += 0.3
  if (identity.shopifyCustomerId) score += 0.2
  return Math.min(1, score)
}
