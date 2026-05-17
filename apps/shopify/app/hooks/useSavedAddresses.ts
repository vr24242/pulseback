import { useState, useCallback } from "react"

export interface SavedAddressData {
  id: string
  name: string
  phone?: string
  address1: string
  address2?: string
  city: string
  state: string
  pincode: string
  label?: string
  isDefault: boolean
  lastUsedAt?: string
  createdAt: string
}

export function useSavedAddresses(customerId: string | null) {
  const [addresses, setAddresses] = useState<SavedAddressData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch saved addresses for the customer
  const fetchAddresses = useCallback(async () => {
    if (!customerId) {
      setAddresses([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/saved-addresses?customerId=${customerId}`)
      if (!res.ok) {
        throw new Error("Failed to fetch addresses")
      }
      const data = await res.json() as { addresses: SavedAddressData[] }
      setAddresses(data.addresses || [])
    } catch (err) {
      console.error("Error fetching saved addresses:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setAddresses([])
    } finally {
      setLoading(false)
    }
  }, [customerId])

  // Save a new address
  const saveAddress = useCallback(
    async (address: Omit<SavedAddressData, "id" | "createdAt" | "lastUsedAt">) => {
      if (!customerId) {
        setError("customerId required")
        return null
      }

      try {
        const res = await fetch("/api/saved-addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...address, customerId }),
        })

        if (!res.ok) {
          throw new Error("Failed to save address")
        }

        const data = await res.json() as { success: boolean; address: SavedAddressData }
        if (data.success && data.address) {
          setAddresses([data.address, ...addresses])
          return data.address
        }
        return null
      } catch (err) {
        console.error("Error saving address:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
        return null
      }
    },
    [customerId, addresses],
  )

  // Delete a saved address
  const deleteAddress = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/saved-addresses?id=${id}`, {
          method: "DELETE",
        })

        if (!res.ok) {
          throw new Error("Failed to delete address")
        }

        setAddresses(addresses.filter(a => a.id !== id))
        return true
      } catch (err) {
        console.error("Error deleting address:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
        return false
      }
    },
    [addresses],
  )

  // Set an address as default
  const setAsDefault = useCallback(
    async (id: string) => {
      try {
        const res = await fetch("/api/saved-addresses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, isDefault: true }),
        })

        if (!res.ok) {
          throw new Error("Failed to set default address")
        }

        // Update local state
        setAddresses(
          addresses.map(a => ({
            ...a,
            isDefault: a.id === id,
          })),
        )
        return true
      } catch (err) {
        console.error("Error setting default address:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
        return false
      }
    },
    [addresses],
  )

  return {
    addresses,
    loading,
    error,
    fetchAddresses,
    saveAddress,
    deleteAddress,
    setAsDefault,
  }
}
