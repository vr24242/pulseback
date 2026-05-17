import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"

/**
 * GET: Fetch all saved addresses for a customer
 * POST: Create a new saved address
 * DELETE: Remove a saved address (via query param ?id=...)
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 })
  }

  try {
    const url = new URL(request.url)
    const customerId = url.searchParams.get("customerId")

    if (!customerId) {
      return json({ error: "customerId required" }, { status: 400 })
    }

    const addresses = await db.savedAddress.findMany({
      where: { customerId },
      orderBy: [
        { isDefault: "desc" },
        { lastUsedAt: "desc" },
        { createdAt: "desc" },
      ],
    })

    return json({ addresses })
  } catch (err) {
    console.error("[api/saved-addresses] GET error:", err)
    return json({ error: "Failed to fetch addresses" }, { status: 500 })
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    if (request.method === "POST") {
      const body = await request.json() as {
        customerId: string
        name: string
        phone?: string
        address1: string
        address2?: string
        city: string
        state: string
        pincode: string
        label?: string
        isDefault?: boolean
      }

      const { customerId, name, phone, address1, address2, city, state, pincode, label, isDefault } = body

      if (!customerId || !name || !address1 || !city || !state || !pincode) {
        return json({ error: "Missing required fields" }, { status: 400 })
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        await db.savedAddress.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        })
      }

      const address = await db.savedAddress.create({
        data: {
          customerId,
          name,
          phone,
          address1,
          address2,
          city,
          state,
          pincode,
          label,
          isDefault: isDefault ?? false,
          country: "IN",
        },
      })

      return json({ success: true, address }, { status: 201 })
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url)
      const id = url.searchParams.get("id")

      if (!id) {
        return json({ error: "id required" }, { status: 400 })
      }

      await db.savedAddress.delete({ where: { id } })

      return json({ success: true })
    }

    if (request.method === "PUT") {
      const body = await request.json() as {
        id: string
        isDefault?: boolean
      }

      const { id, isDefault } = body

      if (!id) {
        return json({ error: "id required" }, { status: 400 })
      }

      // If setting as default, get customerId and unset others
      if (isDefault) {
        const addr = await db.savedAddress.findUniqueOrThrow({ where: { id } })
        await db.savedAddress.updateMany({
          where: { customerId: addr.customerId, isDefault: true },
          data: { isDefault: false },
        })
      }

      // Update lastUsedAt when address is used at checkout
      const updated = await db.savedAddress.update({
        where: { id },
        data: {
          isDefault: isDefault ?? undefined,
          lastUsedAt: new Date(),
        },
      })

      return json({ success: true, address: updated })
    }

    return json({ error: "Method not allowed" }, { status: 405 })
  } catch (err) {
    console.error("[api/saved-addresses] action error:", err)
    return json({ error: "Server error" }, { status: 500 })
  }
}
