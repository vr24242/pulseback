import {
  reactExtension,
  useShippingAddress,
  useApplyAttributeChange,
  useEmail,
  usePhone,
  useSettings,
  Banner,
  BlockSpacer,
  Text,
  InlineStack,
  Spinner,
  TextBlock,
} from "@shopify/ui-extensions-react/checkout"
import { useEffect, useState, useRef } from "react"

const API_BASE = "https://pulseback.fly.dev"

interface ExtSettings {
  shop_domain: string
  [key: string]: string | number | boolean | undefined
}

// Runs after contact info is entered — captures email/phone
export const contactCapture = reactExtension(
  "purchase.checkout.contact.render-after",
  () => <RTOCapture target="contact" />
)

// Runs after delivery address — captures pincode, shows COD warning
export const addressCapture = reactExtension(
  "purchase.checkout.delivery-address.render-after",
  () => <RTOCapture target="address" />
)

type UIState = "idle" | "loading" | "verified" | "new_customer" | "blocked"

function RTOCapture({ target }: { target: "contact" | "address" }) {
  const email = useEmail()
  const phone = usePhone()
  const address = useShippingAddress()
  const settings = useSettings<ExtSettings>()
  const applyAttribute = useApplyAttributeChange()

  const [uiState, setUIState] = useState<UIState>("idle")
  const [rtoScore, setRtoScore] = useState<number | undefined>(undefined)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shopDomain = settings.shop_domain ?? ""
  const pincode = address?.zip ?? ""

  useEffect(() => {
    if (!shopDomain) return
    if (!phone && !email) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    setUIState("loading")

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/checkout/capture`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: phone ?? undefined,
            email: email ?? undefined,
            pincode: pincode || undefined,
            shopDomain,
          }),
        })

        if (!res.ok) {
          setUIState("idle")
          return
        }

        const data = (await res.json()) as {
          codAllowed?: boolean
          rtoScore?: number
          skipped?: boolean
        }

        const score = data.rtoScore
        setRtoScore(score)

        const blocked = data.codAllowed === false

        await applyAttribute({
          type: "updateAttribute",
          key: "_pulseback_cod_blocked",
          value: blocked ? "true" : "false",
        })

        if (score !== undefined) {
          await applyAttribute({
            type: "updateAttribute",
            key: "_pulseback_rto_score",
            value: String(score),
          })
        }

        if (blocked) {
          setUIState("blocked")
        } else if (score !== undefined && score >= 25 && score <= 45) {
          // New customer / moderate risk — informational nudge
          setUIState("new_customer")
        } else if (data.codAllowed === true && (score === undefined || score < 25)) {
          // Low risk — show nothing
          setUIState("idle")
        } else if (data.codAllowed === true) {
          // Verified, higher score but still allowed
          setUIState("verified")
        } else {
          setUIState("idle")
        }
      } catch {
        // Never block checkout on API errors
        setUIState("idle")
      }
    }, 900)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [phone, email, pincode, shopDomain])

  // Contact step: only show loading spinner while in-flight
  if (target === "contact") {
    if (uiState === "loading") {
      return (
        <>
          <BlockSpacer spacing="base" />
          <InlineStack spacing="tight">
            <Spinner size="small" />
          </InlineStack>
        </>
      )
    }
    return null
  }

  // Address step: show all states
  if (target === "address") {
    if (uiState === "loading") {
      return (
        <>
          <BlockSpacer spacing="base" />
          <InlineStack spacing="tight">
            <Spinner size="small" />
          </InlineStack>
        </>
      )
    }

    if (uiState === "blocked") {
      return (
        <>
          <BlockSpacer spacing="base" />
          <Banner status="warning">
            Cash on Delivery is not available for this order based on delivery history. Please use an online payment method (UPI, card, or net banking).
          </Banner>
        </>
      )
    }

    if (uiState === "new_customer") {
      return (
        <>
          <BlockSpacer spacing="base" />
          <Banner status="info">
            First order? Complete with UPI for instant cashback via Razorpay.
          </Banner>
        </>
      )
    }

    if (uiState === "verified") {
      return (
        <>
          <BlockSpacer spacing="base" />
          <Text>&#10003; Your details have been verified</Text>
        </>
      )
    }

    // idle or low-risk: show nothing
    return null
  }

  return null
}
