import { PrismaClient } from "@prisma/client"
import { Resend } from "resend"
import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"

const prisma = new PrismaClient()
const resend = new Resend(process.env.RESEND_API_KEY)

const signupSchema = z.object({
  email: z.string().email(),
  companyName: z.string().min(2),
  productCategory: z.string().min(2),
  shopifyStore: z.string().url(),
  expectedOrders: z.number().int().positive(),
  referralCode: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = signupSchema.parse(body)

    // Check if email already exists
    const existing = await prisma.earlyAdopter.findUnique({
      where: { email: data.email },
    })

    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 })
    }

    // If referral code provided, verify it exists and increment
    let referredBy: string | null = null
    if (data.referralCode) {
      const referrer = await prisma.earlyAdopter.findUnique({
        where: { referralCode: data.referralCode },
      })

      if (!referrer) {
        return NextResponse.json({ error: "Invalid referral code" }, { status: 400 })
      }

      referredBy = referrer.email

      // Increment referral count
      await prisma.earlyAdopter.update({
        where: { email: referrer.email },
        data: { referralCount: { increment: 1 } },
      })

      // Recalculate ranks (referrer moves up)
      await recalculateRanks()

      // Send referral notification email to referrer
      await sendReferralBonusEmail(referrer.email, referrer.referralCount + 1)
    }

    // Create new early adopter
    const earlyAdopter = await prisma.earlyAdopter.create({
      data: {
        email: data.email,
        companyName: data.companyName,
        productCategory: data.productCategory,
        shopifyStore: data.shopifyStore,
        expectedOrders: data.expectedOrders,
        referredBy,
        signupSource: referredBy ? "referral" : "organic",
      },
    })

    // Recalculate all ranks
    await recalculateRanks()

    // Get user's rank
    const userWithRank = await prisma.earlyAdopter.findUnique({
      where: { email: earlyAdopter.email },
    })

    // Send signup confirmation email
    await sendSignupConfirmationEmail(
      earlyAdopter.email,
      earlyAdopter.referralCode,
      userWithRank?.rank || 1
    )

    return NextResponse.json({
      success: true,
      referralCode: earlyAdopter.referralCode,
      rank: userWithRank?.rank || 1,
    })
  } catch (error) {
    console.error("Signup error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to sign up" }, { status: 500 })
  }
}

async function recalculateRanks() {
  // Get all non-churned users sorted by creation date
  const users = await prisma.earlyAdopter.findMany({
    where: {
      status: { not: "churned" },
    },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true },
  })

  // Update ranks based on sorted order
  for (let i = 0; i < users.length; i++) {
    await prisma.earlyAdopter.update({
      where: { id: users[i].id },
      data: { rank: i + 1 },
    })
  }
}

async function sendSignupConfirmationEmail(email: string, referralCode: string, rank: number) {
  try {
    await resend.emails.send({
      from: "waitlist@pulseos.com",
      to: email,
      subject: `You're #${rank} in line for D2C OS`,
      html: `
        <h1>Welcome to PulseOS!</h1>
        <p>You're #${rank} in line for D2C OS.</p>

        <h2>Your Referral Link</h2>
        <p><a href="https://pulseos.com/early-access?ref=${referralCode}">https://pulseos.com/early-access?ref=${referralCode}</a></p>

        <p>Share this link with friends. You'll move up 10 spots per referral!</p>

        <h2>What to expect</h2>
        <p>We'll send you weekly updates on your position in the waitlist. When you reach the top, we'll give you exclusive beta access.</p>
      `,
    })

    // Log email send
    await prisma.emailLog.create({
      data: {
        email,
        type: "signup_confirmation",
        status: "sent",
      },
    })
  } catch (error) {
    console.error("Email send error:", error)
  }
}

async function sendReferralBonusEmail(email: string, newRank: number) {
  try {
    await resend.emails.send({
      from: "waitlist@pulseos.com",
      to: email,
      subject: `Your friend joined! You're now #${newRank} 👀`,
      body: `Your referral worked! You're now #${newRank} in the waitlist.`,
    })

    // Log email send
    await prisma.emailLog.create({
      data: {
        email,
        type: "referral_bonus",
        status: "sent",
      },
    })
  } catch (error) {
    console.error("Referral email error:", error)
  }
}
