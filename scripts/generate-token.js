#!/usr/bin/env node

/**
 * Generate JWT token for testing PWAs
 * Usage: node scripts/generate-token.js <shopId>
 */

const jose = require("jose")
const fs = require("fs")
const path = require("path")

// Load environment
require("dotenv").config()

const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production"
const secret = new TextEncoder().encode(JWT_SECRET)

async function generateToken(shopId) {
  try {
    const payload = {
      shopId,
      shopDomain: "test-shop.myshopify.com",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    }

    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .sign(secret)

    return token
  } catch (error) {
    console.error("Error generating token:", error)
    process.exit(1)
  }
}

const shopId = process.argv[2]
if (!shopId) {
  console.log("Usage: node scripts/generate-token.js <shopId>")
  console.log("Example: node scripts/generate-token.js gid://shopify/Shop/123456")
  process.exit(1)
}

generateToken(shopId).then((token) => {
  console.log("\n✅ JWT Token generated successfully!")
  console.log("\nToken:")
  console.log(token)
  console.log("\nUse this token to login to:")
  console.log("- Merchant PWA: https://merchant-ajf8jrpba-varun-raos-projects.vercel.app")
  console.log("- Customer PWA: https://pulseback-customer-5anhsb6ql-varun-raos-projects.vercel.app")
  console.log("\nExpires in: 24 hours")
})
