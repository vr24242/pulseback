import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"
import { sendWhatsAppText } from "@d2c/core"

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json() as {
    action: "send" | "verify"
    phone: string
    shopDomain: string
    code?: string
  }
  const { action: act, phone, shopDomain, code } = body

  const normalized = phone.replace(/\D/g, "").slice(-10)
  if (normalized.length !== 10) return json({ error: "Invalid phone" }, { status: 400 })

  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    select: {
      id: true,
      aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true,
      waPhoneNumberId: true, waAccessToken: true,
      twilioAccountSid: true, twilioAuthToken: true, twilioPhone: true,
    },
  })
  if (!shop) return json({ error: "Shop not found" }, { status: 404 })

  // ─── SEND ─────────────────────────────────────────────────────
  if (act === "send") {
    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    // Upsert into Postgres — safe across multiple Fly machines
    await db.otpCode.upsert({
      where: { shopId_phone: { shopId: shop.id, phone: normalized } },
      update: { code: otp, expiresAt, used: false },
      create: { shopId: shop.id, phone: normalized, code: otp, expiresAt },
    })

    const message = `Your verification code is: *${otp}*\nValid for 5 minutes. Do not share this with anyone.`

    const hasWhatsApp = !!(shop.aiSensyApiKey || shop.watiApiToken || shop.waPhoneNumberId)

    if (hasWhatsApp) {
      await sendWhatsAppText({
        phone: normalized,
        body: message,
        shopConfig: {
          aiSensyApiKey: shop.aiSensyApiKey ?? undefined,
          watiApiToken: shop.watiApiToken ?? undefined,
          watiApiUrl: shop.watiPhoneNumber ?? undefined,
          waPhoneNumberId: shop.waPhoneNumberId ?? undefined,
          waAccessToken: shop.waAccessToken ?? undefined,
        },
      })
    } else if (shop.twilioAccountSid && shop.twilioAuthToken && shop.twilioPhone) {
      await sendTwilioSMS({
        to: `+91${normalized}`,
        body: `Your OTP: ${otp}. Valid 5 min. Do not share.`,
        accountSid: shop.twilioAccountSid,
        authToken: shop.twilioAuthToken,
        from: shop.twilioPhone,
      })
    } else {
      // Dev fallback
      console.log(`[OTP] ${normalized}: ${otp}`)
    }

    return json({ ok: true, sent: true })
  }

  // ─── VERIFY ───────────────────────────────────────────────────
  if (act === "verify") {
    const entry = await db.otpCode.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone: normalized } },
    })

    if (!entry || entry.used) {
      return json({ ok: false, error: "OTP expired or already used" }, { status: 400 })
    }
    if (new Date() > entry.expiresAt) {
      await db.otpCode.delete({ where: { id: entry.id } })
      return json({ ok: false, error: "OTP expired" }, { status: 400 })
    }
    if (entry.code !== code) {
      return json({ ok: false, error: "Incorrect OTP" }, { status: 400 })
    }

    // Mark used — prevents replay attacks even within the expiry window
    await db.otpCode.update({ where: { id: entry.id }, data: { used: true } })

    // Load customer history for address autofill
    const customer = await db.customer.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone: normalized } },
      select: {
        id: true, name: true, email: true, pincode: true,
        totalOrders: true, ltvTier: true, rtoRiskScore: true,
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { shippingAddress: true },
        },
      },
    })

    return json({
      ok: true,
      verified: true,
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            pincode: customer.pincode,
            totalOrders: customer.totalOrders,
            ltvTier: customer.ltvTier,
            rtoScore: customer.rtoRiskScore,
            lastAddress: customer.orders[0]?.shippingAddress ?? null,
          }
        : null,
    })
  }

  return json({ error: "Unknown action" }, { status: 400 })
}

async function sendTwilioSMS(opts: {
  to: string; body: string; accountSid: string; authToken: string; from: string
}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`
  const creds = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64")
  const form = new URLSearchParams({ To: opts.to, From: opts.from, Body: opts.body })
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  })
}
