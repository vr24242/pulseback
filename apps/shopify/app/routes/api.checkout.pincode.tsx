import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { lookupPincodeWithCache } from "@d2c/core/location"

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 })
  }

  try {
    const body = await request.json() as { pincode?: string }
    const { pincode } = body

    if (!pincode) {
      return json({ error: "Pincode required" }, { status: 400 })
    }

    const info = await lookupPincodeWithCache(pincode)

    if (!info || !info.valid) {
      return json({ valid: false, error: "Invalid or unserviceable pincode" })
    }

    return json({
      valid: true,
      pincode: info.pincode,
      city: info.city,
      state: info.state,
      district: info.district,
    })
  } catch (err) {
    console.error("[checkout/pincode]", err)
    // Never block checkout on API errors
    return json({ valid: false, error: "Could not validate pincode" })
  }
}
