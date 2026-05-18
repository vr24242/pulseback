import { PrismaClient } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email")

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 })
    }

    const user = await prisma.earlyAdopter.findUnique({
      where: { email },
      select: {
        rank: true,
        referralCode: true,
        referralCount: true,
        createdAt: true,
        status: true,
        _count: {
          select: { referrals: true },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({
      rank: user.rank,
      referralCode: user.referralCode,
      referralCount: user.referralCount,
      referralLink: `https://pulseos.com/early-access?ref=${user.referralCode}`,
      status: user.status,
      createdAt: user.createdAt,
    })
  } catch (error) {
    console.error("Get status error:", error)
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 })
  }
}
