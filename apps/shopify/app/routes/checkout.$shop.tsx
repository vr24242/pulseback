import { useState, useEffect, useRef } from "react"
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import { db } from "@d2c/database"
import { useSavedAddresses } from "../hooks/useSavedAddresses"
import { SavedAddressesPanel } from "../components/SavedAddressesPanel"

// Razorpay SDK injected at runtime via script tag
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void }
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.shopName ? `Checkout — ${data.shopName}` : "Checkout" },
]

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const shopDomain = decodeURIComponent(params.shop ?? "")
  const url = new URL(request.url)
  const returnUrl = url.searchParams.get("return_url") ?? "https://shopify.com"

  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    select: {
      id: true,
      name: true,
      domain: true,
      rtoThreshold: true,
      currency: true,
      brandPrimaryColor: true,
      brandSecondaryColor: true,
      logoUrl: true,
      checkoutFont: true,
    },
  })
  if (!shop) throw new Response("Shop not found", { status: 404 })

  return json({
    shopDomain,
    shopName: shop.name ?? shopDomain,
    rtoThreshold: shop.rtoThreshold,
    returnUrl,
    brandPrimaryColor: shop.brandPrimaryColor ?? "#7c3aed",
    brandSecondaryColor: shop.brandSecondaryColor ?? "#6366f1",
    logoUrl: shop.logoUrl,
    checkoutFont: shop.checkoutFont ?? "sans-serif",
  })
}

type Step = "phone" | "otp" | "address" | "payment" | "success"

interface CartItem { variantId: string; title: string; quantity: number; price: number; image?: string }

interface CustomerData {
  id: string; name?: string | null; email?: string | null; pincode?: string | null
  totalOrders: number; ltvTier?: string | null; rtoScore: number
  lastAddress: Record<string, string> | null
}

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh",
]

export default function CheckoutPage() {
  const {
    shopDomain,
    shopName,
    rtoThreshold,
    returnUrl,
    brandPrimaryColor,
    brandSecondaryColor,
    logoUrl,
    checkoutFont,
  } = useLoaderData<typeof loader>()

  const [step, setStep] = useState<Step>("phone")
  const [phone, setPhone] = useState("")
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""])
  const [otpError, setOtpError] = useState("")
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [customer, setCustomer] = useState<CustomerData | null>(null)
  const [cartItems] = useState<CartItem[]>([]) // populated from parent window in prod
  const [cartTotal] = useState(0)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [address1, setAddress1] = useState("")
  const [address2, setAddress2] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [pincode, setPincode] = useState("")
  const [consentGiven, setConsentGiven] = useState(false)
  const [payMethod, setPayMethod] = useState<"cod" | "prepaid">("prepaid")
  const [codBlocked, setCodBlocked] = useState(false)
  const [orderName, setOrderName] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [shippingCost, setShippingCost] = useState(0)
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null)
  const [checkingShipping, setCheckingShipping] = useState(false)
  const [validatingPincode, setValidatingPincode] = useState(false)
  const [pincodeError, setPincodeError] = useState("")
  const [selectedAddressId, setSelectedAddressId] = useState<string | undefined>()
  const [showSaveAddress, setShowSaveAddress] = useState(false)
  const [addressLabel, setAddressLabel] = useState("")

  // Saved addresses
  const savedAddresses = useSavedAddresses(customer?.id ?? null)

  const otpRefs = useRef<Array<HTMLInputElement | null>>([])

  // Fetch saved addresses when customer logs in
  useEffect(() => {
    if (customer?.id) {
      savedAddresses.fetchAddresses()
    }
  }, [customer?.id])

  // Validate & auto-fill city/state when pincode changes (debounced)
  useEffect(() => {
    if (!pincode || pincode.length < 6) {
      setPincodeError("")
      return
    }
    const timer = setTimeout(async () => {
      setValidatingPincode(true)
      setPincodeError("")
      try {
        const res = await fetch("/api/checkout/pincode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pincode }),
        })
        const data = await res.json() as {
          valid?: boolean
          city?: string
          state?: string
          error?: string
        }
        if (data.valid && data.city && data.state) {
          setCity(data.city)
          setState(data.state)
          setPincodeError("")
        } else {
          setPincodeError(data.error || "Could not validate pincode")
        }
      } catch {
        // Network error — allow user to continue
        setPincodeError("")
      } finally {
        setValidatingPincode(false)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [pincode])

  // Check shipping details when pincode changes (debounced)
  useEffect(() => {
    if (!pincode || pincode.length < 6) return
    const timer = setTimeout(async () => {
      setCheckingShipping(true)
      try {
        const res = await fetch("/api/checkout/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: phone || undefined,
            email: email || undefined,
            pincode,
            shopDomain,
          }),
        })
        const data = await res.json() as {
          shippingCost?: number
          deliveryDate?: string
        }
        if (data.shippingCost !== undefined) setShippingCost(data.shippingCost)
        if (data.deliveryDate) setDeliveryDate(new Date(data.deliveryDate))
      } catch { /* ignore */ } finally {
        setCheckingShipping(false)
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [pincode, shopDomain, phone, email])

  // Pre-fill from customer history on OTP verify success
  useEffect(() => {
    if (!customer) return
    if (customer.name) setName(customer.name)
    if (customer.email) setEmail(customer.email)
    if (customer.pincode) setPincode(customer.pincode)
    if (customer.rtoScore >= (rtoThreshold ?? 60)) {
      setCodBlocked(true)
      setPayMethod("prepaid")
    }
    const addr = customer.lastAddress as Record<string, string> | null
    if (addr) {
      setAddress1(addr.address1 ?? "")
      setAddress2(addr.address2 ?? "")
      setCity(addr.city ?? "")
      setState(addr.province ?? "")
      setPincode(addr.zip ?? customer.pincode ?? "")
    }
  }, [customer, rtoThreshold])

  async function handleSendOTP() {
    if (phone.replace(/\D/g, "").length !== 10) return
    setSending(true)
    setErrorMsg("")
    try {
      const res = await fetch("/api/checkout/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone, shopDomain }),
      })
      if (res.ok) setStep("otp")
      else setErrorMsg("Failed to send OTP. Try again.")
    } finally {
      setSending(false)
    }
  }

  async function handleVerifyOTP() {
    const code = otpDigits.join("")
    if (code.length !== 6) return
    setVerifying(true)
    setOtpError("")
    try {
      const res = await fetch("/api/checkout/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", phone, shopDomain, code }),
      })
      const data = await res.json() as { ok: boolean; verified?: boolean; customer?: CustomerData; error?: string }
      if (data.verified) {
        setCustomer(data.customer ?? null)
        setStep("address")
      } else {
        setOtpError(data.error ?? "Incorrect OTP")
      }
    } finally {
      setVerifying(false)
    }
  }

  function handleOtpKey(i: number, val: string) {
    const digits = [...otpDigits]
    digits[i] = val.slice(-1)
    setOtpDigits(digits)
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
    if (!val && i > 0) otpRefs.current[i - 1]?.focus()
  }

  // ── Place Shopify order after payment confirmed ───────────────────────────────
  async function placeShopifyOrder(razorpayPaymentId?: string) {
    const res = await fetch("/api/checkout/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopDomain, phone, email, name,
        address: { address1, address2, city, province: state, zip: pincode, country: "India" },
        paymentMethod: payMethod,
        razorpayPaymentId,
        cartItems, cartTotal,
      }),
    })
    const data = await res.json() as { ok?: boolean; orderName?: string; codBlocked?: boolean; error?: string }
    if (data.ok) {
      setOrderName(data.orderName ?? "")
      setStep("success")
    } else if (data.codBlocked) {
      setCodBlocked(true)
      setPayMethod("prepaid")
      setErrorMsg("COD is not available for your profile. Please pay online.")
    } else {
      setErrorMsg(data.error ?? "Something went wrong")
    }
  }

  async function handlePlaceOrder() {
    if (!name || !address1 || !city || !state || !pincode) {
      setErrorMsg("Please fill all required fields")
      return
    }
    setErrorMsg("")

    // ── COD: place directly ───────────────────────────────────────────────────
    if (payMethod === "cod") {
      setPlacing(true)
      try { await placeShopifyOrder() } finally { setPlacing(false) }
      return
    }

    // ── Prepaid: Razorpay modal → verify → place ──────────────────────────────
    setPlacing(true)
    try {
      // 1. Create Razorpay order (secret stays server-side)
      const orderRes = await fetch("/api/checkout/razorpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-order",
          amount: Math.round(cartTotal * 100), // ₹ → paise
          currency: "INR",
          receipt: `pb_${Date.now()}`,
        }),
      })
      const orderData = await orderRes.json() as {
        ok: boolean; orderId?: string; keyId?: string; amount?: number; error?: string
      }
      if (!orderData.ok || !orderData.orderId || !orderData.keyId) {
        setErrorMsg(orderData.error ?? "Failed to initiate payment")
        return
      }

      // 2. Load Razorpay SDK if not already loaded
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script")
          s.src = "https://checkout.razorpay.com/v1/checkout.js"
          s.onload = () => resolve()
          s.onerror = () => reject(new Error("SDK load failed"))
          document.body.appendChild(s)
        })
      }

      // 3. Open modal, verify, place order
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: orderData.keyId,
          amount: orderData.amount,
          currency: "INR",
          order_id: orderData.orderId,
          name: shopName,
          description: "Order payment",
          prefill: { contact: `91${phone}`, email: email ?? "", name: name ?? "" },
          theme: { color: brandPrimaryColor },
          handler: async (response: {
            razorpay_payment_id: string
            razorpay_order_id: string
            razorpay_signature: string
          }) => {
            try {
              // 4. Verify HMAC signature server-side
              const verifyRes = await fetch("/api/checkout/razorpay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "verify",
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              })
              const verifyData = await verifyRes.json() as { ok: boolean; paymentId?: string; error?: string }
              if (!verifyData.ok) {
                setErrorMsg(verifyData.error ?? "Payment verification failed")
                reject(new Error("verify failed"))
                return
              }
              // 5. Place Shopify order with verified payment ID
              await placeShopifyOrder(verifyData.paymentId)
              resolve()
            } catch (err) { reject(err) }
          },
          modal: {
            ondismiss: () => {
              setErrorMsg("Payment cancelled. Please try again.")
              reject(new Error("dismissed"))
            },
          },
        })
        rzp.open()
      })
    } catch (err) {
      if (err instanceof Error && err.message !== "dismissed") {
        setErrorMsg("Payment failed. Please try again.")
        console.error("[checkout] razorpay:", err)
      }
    } finally {
      setPlacing(false)
    }
  }

  const cartSummary = cartItems.length > 0
    ? cartItems.map(i => `${i.title} ×${i.quantity}`).join(", ")
    : "Your cart items"

  // Calculate savings and risk tier
  const rtoScore = customer?.rtoScore ?? 0
  const codSavings = shippingCost // customer saves this much by choosing prepaid
  const riskTier = rtoScore < 40 ? "low" : rtoScore < 60 ? "medium" : "high"
  const riskLabel = rtoScore < 40 ? "Low Risk" : rtoScore < 60 ? "Standard Risk" : "High Risk"
  const riskColor = rtoScore < 40 ? "#10b981" : rtoScore < 60 ? "#f59e0b" : "#ef4444"

  // Incentive message based on risk tier
  const incentiveMsg =
    rtoScore < 40 ? "Pay online for instant order confirmation" :
    rtoScore < 60 ? `Save ₹${Math.round(codSavings)} with prepaid` :
    "Prepaid recommended for faster processing"

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: checkoutFont }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        {logoUrl ? (
          <img src={logoUrl} alt={shopName} style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 32, height: 32, background: brandPrimaryColor, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>P</span>
          </div>
        )}
        <span style={{ fontWeight: 600, fontSize: 16, color: "#111" }}>{shopName}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#6b7280" }}>Secure Checkout</span>
        <span style={{ fontSize: 18 }}>🔒</span>
      </header>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>

        {/* Step indicator */}
        {step !== "success" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {(["phone", "otp", "address", "payment"] as Step[]).map((s, i) => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: stepIndex(step) >= i ? brandPrimaryColor : "#e5e7eb" }} />
            ))}
          </div>
        )}

        {/* ── STEP: Phone ── */}
        {step === "phone" && (
          <Card title="Enter your phone number">
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>
              We'll send a one-time password to verify your identity and autofill your address.
            </p>
            <label style={labelStyle}>Mobile Number</label>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ ...inputStyle, width: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", color: "#374151", fontWeight: 500 }}>+91</span>
              <input
                style={{ ...inputStyle, flex: 1 }}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={e => e.key === "Enter" && handleSendOTP()}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
              <input
                id="dpdp-consent"
                type="checkbox"
                checked={consentGiven}
                onChange={e => setConsentGiven(e.target.checked)}
                style={{ accentColor: brandPrimaryColor, width: 16, height: 16, marginTop: 2, flexShrink: 0, cursor: "pointer" }}
              />
              <label htmlFor="dpdp-consent" style={{ fontSize: 12, color: "rgba(232,232,240,0.6)", lineHeight: 1.5, cursor: "pointer" }}>
                I agree to receive order updates via WhatsApp. By providing my number, I consent to
                processing of my personal data as per India's{" "}
                <a href="https://digitalindia.gov.in/dpdp" target="_blank" rel="noreferrer" style={{ color: brandPrimaryColor }}>
                  DPDP Act 2023
                </a>.
              </label>
            </div>
            {errorMsg && <ErrorText msg={errorMsg} />}
            <Btn onClick={handleSendOTP} loading={sending} disabled={phone.length !== 10 || !consentGiven} color={brandPrimaryColor}>
              Send OTP via WhatsApp
            </Btn>
            <p style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", marginTop: 12 }}>
              🔒 Your data is encrypted and never shared
            </p>
          </Card>
        )}

        {/* ── STEP: OTP ── */}
        {step === "otp" && (
          <Card title="Verify your number">
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>
              OTP sent to <strong>+91 {phone}</strong> via WhatsApp.{" "}
              <button onClick={() => setStep("phone")} style={{ color: brandPrimaryColor, background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0 }}>
                Change
              </button>
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el }}
                  style={{ width: 44, height: 52, textAlign: "center", fontSize: 22, fontWeight: 600, border: "2px solid #e5e7eb", borderRadius: 10, outline: "none", color: "#111" }}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleOtpKey(i, e.target.value)}
                  onKeyDown={e => { if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus() }}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {otpError && <ErrorText msg={otpError} />}
            <Btn onClick={handleVerifyOTP} loading={verifying} disabled={otpDigits.join("").length !== 6} color={brandPrimaryColor}>
              Verify & Continue
            </Btn>
            <p style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", marginTop: 12 }}>
              Didn't receive it?{" "}
              <button onClick={handleSendOTP} style={{ color: brandPrimaryColor, background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0 }}>
                Resend OTP
              </button>
            </p>
          </Card>
        )}

        {/* ── STEP: Address ── */}
        {step === "address" && (
          <Card title="Delivery details">
            {customer && customer.totalOrders > 0 && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#166534" }}>
                👋 Welcome back! You've ordered {customer.totalOrders} time{customer.totalOrders !== 1 ? "s" : ""} — your address is pre-filled.
              </div>
            )}

            {/* Saved Addresses Panel */}
            {savedAddresses.addresses.length > 0 && (
              <SavedAddressesPanel
                addresses={savedAddresses.addresses}
                selectedAddressId={selectedAddressId}
                onSelectAddress={addr => {
                  setSelectedAddressId(addr.id)
                  setName(addr.name)
                  setAddress1(addr.address1)
                  setAddress2(addr.address2 || "")
                  setCity(addr.city)
                  setState(addr.state)
                  setPincode(addr.pincode)
                  if (addr.phone) {
                    // Note: phone is already set from OTP, don't override
                  }
                }}
                onDeleteAddress={savedAddresses.deleteAddress}
                onSetDefault={savedAddresses.setAsDefault}
                onAddNew={() => setSelectedAddressId(undefined)}
                loading={savedAddresses.loading}
              />
            )}

            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#111827", marginTop: 16 }}>
              {selectedAddressId ? "Edit Address" : "Enter Address"}
            </h3>
            <Field label="Full Name *" value={name} onChange={setName} placeholder="Rahul Sharma" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="rahul@example.com" type="email" />
            <Field label="Address Line 1 *" value={address1} onChange={setAddress1} placeholder="House / Flat / Building" />
            <Field label="Address Line 2" value={address2} onChange={setAddress2} placeholder="Street / Colony (optional)" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>City *</label>
                <div style={{ position: "relative" }}>
                  <input
                    style={{ ...inputStyle, paddingRight: 36 }}
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="Mumbai"
                    disabled={validatingPincode}
                  />
                  {city && !validatingPincode && <span style={{ position: "absolute", right: 12, top: 12, color: "#10b981" }}>✓</span>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Pincode *</label>
                <div style={{ position: "relative" }}>
                  <input
                    style={{ ...inputStyle, paddingRight: 36 }}
                    type="tel"
                    value={pincode}
                    onChange={e => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="400001"
                    maxLength={6}
                  />
                  {validatingPincode && <span style={{ position: "absolute", right: 12, top: 12, color: "#f59e0b" }}>⏳</span>}
                  {pincode.length === 6 && !validatingPincode && (pincodeError ? (
                    <span style={{ position: "absolute", right: 12, top: 12, color: "#ef4444" }}>✗</span>
                  ) : (
                    <span style={{ position: "absolute", right: 12, top: 12, color: "#10b981" }}>✓</span>
                  ))}
                </div>
              </div>
            </div>
            {pincodeError && <ErrorText msg={pincodeError} />}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>State *</label>
              <div style={{ position: "relative" }}>
                <select
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    cursor: "pointer",
                    paddingRight: 36,
                    opacity: validatingPincode ? 0.6 : 1,
                  }}
                  value={state}
                  onChange={e => setState(e.target.value)}
                  disabled={validatingPincode}
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {state && !validatingPincode && <span style={{ position: "absolute", right: 12, top: 12, color: "#10b981" }}>✓</span>}
              </div>
            </div>

            {/* Shipping details card */}
            {pincode.length === 6 && (
              <div style={{ background: "#f0f9ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 13 }}>
                {checkingShipping ? (
                  <div style={{ color: "#0284c7", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>⏳ Checking availability...</span>
                  </div>
                ) : deliveryDate ? (
                  <>
                    <div style={{ color: "#0c4a6e", fontWeight: 600, marginBottom: 4 }}>📦 Delivery by {deliveryDate.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}</div>
                    {shippingCost > 0 && (
                      <div style={{ color: "#0c4a6e", fontSize: 12 }}>
                        {payMethod === "cod" ? `+ ₹${shippingCost} COD charge` : "Free shipping"}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: "#0284c7" }}>✓ Serviceable</div>
                )}
              </div>
            )}

            {/* Save address option for returning customers */}
            {customer && customer.totalOrders > 0 && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}>
                <input
                  type="checkbox"
                  id="save-address"
                  checked={showSaveAddress}
                  onChange={e => setShowSaveAddress(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <label htmlFor="save-address" style={{ flex: 1, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                  Save this address for next time
                </label>
              </div>
            )}

            {showSaveAddress && (
              <input
                type="text"
                placeholder="Label (e.g., Home, Office)"
                value={addressLabel}
                onChange={e => setAddressLabel(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 14,
                  marginBottom: 16,
                }}
              />
            )}

            {errorMsg && <ErrorText msg={errorMsg} />}
            <Btn onClick={async () => {
              if (!name || !address1 || !city || !state || !pincode) { setErrorMsg("Please fill all required fields"); return }
              setErrorMsg("")

              // Save address if checkbox is checked
              if (showSaveAddress && customer?.id) {
                const saved = await savedAddresses.saveAddress({
                  name,
                  phone,
                  address1,
                  address2,
                  city,
                  state,
                  pincode,
                  label: addressLabel || undefined,
                  isDefault: false,
                })
                if (!saved) {
                  setErrorMsg("Failed to save address")
                  return
                }
              }

              setStep("payment")
            }} color={brandPrimaryColor}>
              Continue to Payment
            </Btn>
          </Card>
        )}

        {/* ── STEP: Payment ── */}
        {step === "payment" && (
          <Card title="Payment method">
            {/* Risk Tier & Incentive Badge */}
            <div style={{
              background: `${riskColor}15`,
              border: `1px solid ${riskColor}40`,
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 16,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
              <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: riskColor,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}>
                {rtoScore < 40 ? "✓" : rtoScore < 60 ? "!" : "⚠"}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: riskColor, marginBottom: 2 }}>{riskLabel}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>{incentiveMsg}</div>
              </div>
            </div>

            <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#374151" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Order Summary</div>
              <div style={{ color: "#6b7280", marginBottom: 8 }}>{cartSummary}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
                <span style={{ color: "#6b7280" }}>Subtotal</span>
                <span style={{ fontWeight: 600 }}>₹{cartTotal.toLocaleString("en-IN")}</span>
              </div>
              {payMethod === "cod" && shippingCost > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>COD Charge</span>
                  <span style={{ fontWeight: 600, color: "#ef4444" }}>+₹{shippingCost.toLocaleString("en-IN")}</span>
                </div>
              )}
              {cartTotal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #e5e7eb", marginTop: 8 }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>₹{(cartTotal + (payMethod === "cod" ? shippingCost : 0)).toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <PayOption
                value="prepaid"
                selected={payMethod === "prepaid"}
                onSelect={() => setPayMethod("prepaid")}
                title="Pay Online"
                subtitle="UPI / Card / Net Banking via Razorpay"
                badge="Recommended"
                badgeColor={brandPrimaryColor}
                icon="💳"
                color={brandPrimaryColor}
              />
              <PayOption
                value="cod"
                selected={payMethod === "cod"}
                onSelect={() => { if (!codBlocked) setPayMethod("cod") }}
                title="Cash on Delivery"
                subtitle={codBlocked ? "Not available for this order" : "Pay when your order arrives"}
                disabled={codBlocked}
                icon="💵"
                color={brandPrimaryColor}
              />
            </div>

            {codBlocked && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
                ⚠️ COD is not available based on your order history. Please pay online.
              </div>
            )}

            {errorMsg && <ErrorText msg={errorMsg} />}

            <Btn onClick={handlePlaceOrder} loading={placing} color={brandPrimaryColor}>
              {payMethod === "cod" ? "Place Order (COD)" : "Pay Now →"}
            </Btn>
            <button
              onClick={() => setStep("address")}
              style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14 }}
            >
              ← Back to Address
            </button>
          </Card>
        )}

        {/* ── STEP: Success ── */}
        {step === "success" && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 8 }}>Order Placed!</h2>
            {orderName && <p style={{ fontSize: 15, color: "#6b7280", marginBottom: 4 }}>Order {orderName}</p>}
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 32 }}>
              {payMethod === "cod"
                ? "Pay cash when your order arrives. You'll receive a WhatsApp confirmation shortly."
                : "Payment confirmed! You'll receive a WhatsApp update when your order ships."}
            </p>
            <a
              href={returnUrl}
              style={{ display: "inline-block", background: brandPrimaryColor, color: "#fff", padding: "12px 28px", borderRadius: 10, fontWeight: 600, textDecoration: "none", fontSize: 15 }}
            >
              Continue Shopping
            </a>
          </div>
        )}

        {/* Trust badges */}
        {step !== "success" && (
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 24 }}>
            {["🔒 SSL Secure", "✅ 100% Safe", "📦 Free Returns"].map(t => (
              <span key={t} style={{ fontSize: 12, color: "#9ca3af" }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function stepIndex(s: Step) {
  return { phone: 0, otp: 1, address: 2, payment: 3, success: 4 }[s]
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 16 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 16, marginTop: 0 }}>{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function Btn({ onClick, loading, disabled, children, color = "#7c3aed" }: {
  onClick: () => void; loading?: boolean; disabled?: boolean; children: React.ReactNode; color?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        width: "100%", padding: "14px 0", background: loading || disabled ? `${color}80` : color,
        color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600,
        cursor: loading || disabled ? "not-allowed" : "pointer", marginTop: 8, transition: "background 0.2s",
      }}
    >
      {loading ? "Please wait…" : children}
    </button>
  )
}

function PayOption({ value, selected, onSelect, title, subtitle, badge, badgeColor, disabled, icon, color = "#7c3aed" }: {
  value: string; selected: boolean; onSelect: () => void; title: string; subtitle: string
  badge?: string; badgeColor?: string; disabled?: boolean; icon?: string; color?: string
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        border: `2px solid ${selected ? color : "#e5e7eb"}`,
        borderRadius: 10, padding: "14px 16px", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, display: "flex", alignItems: "center", gap: 12,
        background: selected ? `${color}15` : "#fff", transition: "all 0.15s",
      }}
    >
      <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selected ? color : "#d1d5db"}`, background: selected ? color : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {selected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
      </div>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#111", display: "flex", alignItems: "center", gap: 8 }}>
          {title}
          {badge && <span style={{ fontSize: 10, background: badgeColor, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>{badge}</span>}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  )
}

function ErrorText({ msg }: { msg: string }) {
  return <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12, marginTop: -4 }}>⚠️ {msg}</p>
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 8,
  fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", background: "#fff",
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em",
}
