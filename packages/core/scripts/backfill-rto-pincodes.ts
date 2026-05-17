import { db } from "@d2c/database"

async function backfillRTOPincodes() {
  // Get all orders and analyze RTO rates by pincode
  const orders = await db.order.findMany({
    where: {
      shippingAddress: { not: null },
    },
    select: {
      id: true,
      isRTO: true,
      shippingAddress: true,
    },
  })

  // Group by pincode
  const pincodeStats: Record<string, { total: number; rto: number }> = {}

  for (const order of orders) {
    if (!order.shippingAddress || typeof order.shippingAddress !== "object") continue

    const addr = order.shippingAddress as Record<string, unknown>
    const pincode = String(addr.zip ?? addr.pincode ?? "").trim()

    if (!pincode) continue

    if (!pincodeStats[pincode]) {
      pincodeStats[pincode] = { total: 0, rto: 0 }
    }

    pincodeStats[pincode].total += 1
    if (order.isRTO) {
      pincodeStats[pincode].rto += 1
    }
  }

  // Find pincodes with high RTO rates
  // Threshold: >5 RTOs or >30% RTO rate (with min 10 orders)
  const highRTOPincodes = Object.entries(pincodeStats)
    .filter(([, stats]) => {
      const rtoRate = stats.rto / Math.max(stats.total, 1)
      return (
        stats.rto >= 5 ||
        (stats.total >= 10 && rtoRate > 0.3)
      )
    })
    .map(([pincode, stats]) => ({
      pincode,
      rtoCount: stats.rto,
      totalOrders: stats.total,
      rtoRate: (stats.rto / Math.max(stats.total, 1) * 100).toFixed(1),
    }))
    .sort((a, b) => b.rtoCount - a.rtoCount)

  console.log(`\n📊 High-RTO Pincodes (${highRTOPincodes.length} total):\n`)
  
  for (const p of highRTOPincodes) {
    console.log(
      `  ${p.pincode}: ${p.rtoCount} RTOs / ${p.totalOrders} orders (${p.rtoRate}%)`
    )
  }

  console.log(
    `\n📋 Add to scorer.ts:\nconst HIGH_RTO_PINCODES = new Set<string>([\n  ${highRTOPincodes.map(p => `"${p.pincode}"`).join(",\n  ")}\n])\n`
  )

  await db.$disconnect()
}

backfillRTOPincodes().catch(err => {
  console.error("Error:", err)
  process.exit(1)
})
