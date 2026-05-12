import {
  reactExtension,
  useApi,
  useApplyAttributeChange,
  useAttributeValues,
  useBuyerJourneyIntercept,
  useDeliveryAddress,
  useEmail,
  usePhone,
  BlockStack,
  Text,
  TextField,
  Banner,
} from "@shopify/ui-extensions-react/checkout"
import { useState, useEffect } from "react"

export default reactExtension(
  "purchase.contact-information.render-after",
  () => <CheckoutIdentity />
)

function CheckoutIdentity() {
  const { shop, sessionToken } = useApi()
  const applyAttributeChange = useApplyAttributeChange()

  // Read what Shopify already knows
  const phone = usePhone()
  const email = useEmail()
  const deliveryAddress = useDeliveryAddress()

  const [pincode, setPincode] = useState(deliveryAddress?.zip ?? "")
  const [pincodeError, setPincodeError] = useState("")
  const [captured, setCaptured] = useState(false)

  // Capture identity on mount and whenever contact info changes
  useEffect(() => {
    if ((phone || email) && !captured) {
      captureIdentity({ phone, email, pincode: deliveryAddress?.zip ?? "" })
      setCaptured(true)
    }
  }, [phone, email])

  // Intercept checkout to validate pincode and capture final state
  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
      if (canBlockProgress) {
        setPincodeError("Please enter a valid 6-digit pincode")
        return { behavior: "block", reason: "Invalid pincode" }
      }
    }
    // Capture final identity before payment
    captureIdentity({ phone, email, pincode })
    return { behavior: "allow" }
  })

  async function captureIdentity(data: {
    phone: string | undefined
    email: string | undefined
    pincode: string
  }) {
    try {
      const token = await sessionToken.get()
      const checkoutToken = shop.myshopifyDomain

      await fetch("https://pulseback.fly.dev/api/checkout/capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: data.phone,
          email: data.email,
          pincode: data.pincode,
          shopDomain: shop.myshopifyDomain,
        }),
      })

      // Store pincode as checkout attribute
      await applyAttributeChange({
        key: "pb_pincode",
        type: "updateAttribute",
        value: data.pincode,
      })
    } catch (e) {
      // Silent — never block checkout on our errors
    }
  }

  // Only show pincode field if address section hasn't captured it
  if (deliveryAddress?.zip) return null

  return (
    <BlockStack spacing="base">
      <TextField
        label="Pincode"
        value={pincode}
        onChange={(val) => {
          setPincode(val)
          setPincodeError("")
          applyAttributeChange({
            key: "pb_pincode",
            type: "updateAttribute",
            value: val,
          })
        }}
        onBlur={() => {
          if (pincode) captureIdentity({ phone, email, pincode })
        }}
        error={pincodeError}
        maxLength={6}
      />
      {pincodeError && (
        <Banner status="critical">{pincodeError}</Banner>
      )}
    </BlockStack>
  )
}
