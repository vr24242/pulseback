/**
 * Shiprocket MCP Service — initialized from env vars
 * Used by workers and agents to access logistics data
 */

import { ShiprocketMCP } from "../agents/shiprocket"

let shiprocketMCP: ShiprocketMCP | null = null

/**
 * Initialize Shiprocket MCP from environment variables
 * Called once on worker startup
 */
export async function initializeShiprocketMCP(): Promise<ShiprocketMCP> {
  if (shiprocketMCP) {
    return shiprocketMCP
  }

  const email = process.env.SHIPROCKET_API_EMAIL
  const password = process.env.SHIPROCKET_API_PASSWORD

  if (!email || !password) {
    throw new Error(
      "SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD not configured"
    )
  }

  shiprocketMCP = new ShiprocketMCP({
    email,
    password,
  })

  await shiprocketMCP.authenticate()

  console.log(`[ShiprocketMCP] Initialized for ${email}`)
  return shiprocketMCP
}

/**
 * Get initialized Shiprocket MCP instance
 */
export async function getShiprocket(): Promise<ShiprocketMCP> {
  if (!shiprocketMCP) {
    await initializeShiprocketMCP()
  }

  return shiprocketMCP!
}
