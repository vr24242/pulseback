import { useState, useRef } from "react"
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useSearchParams, useSubmit } from "@remix-run/react"
import { db } from "@d2c/database"
import { queueCommunication } from "@d2c/core/queue"

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  title: string
  quantity: number
  price: number
}

interface EligibleOrder {
  id: string
  shopifyOrderName: string
  totalPrice: number
  paymentMethod: string
  deliveredAt: string
  items: OrderItem[]
  customerName: string | null
  customerPhone: string | null
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.shopName ? `Returns — ${data.shopName}` : "Returns Portal" },
]

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const shopDomain = decodeURIComponent(params.shop ?? "")
  const url = new URL(request.url)
  const phone = url.searchParams.get("phone") ?? ""

  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    select: { id: true, name: true, domain: true },
  })
  if (!shop) throw new Response("Shop not found", { status: 404 })

  // Only fetch eligible orders when phone is present (post-OTP-verify)
  let eligibleOrders: EligibleOrder[] = []
  if (phone && phone.length === 10) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const orders = await db.order.findMany({
      where: {
        shopId: shop.id,
        status: "delivered",
        deliveredAt: { gte: sevenDaysAgo },
        customer: { phone },
        // Exclude orders that already have a non-rejected return request
        NOT: {
          returnRequests: {
            some: {
              status: { not: "rejected" },
            },
          },
        },
      },
      select: {
        id: true,
        shopifyOrderName: true,
        totalPrice: true,
        paymentMethod: true,
        deliveredAt: true,
        items: true,
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { deliveredAt: "desc" },
    })

    eligibleOrders = orders.map((o) => ({
      id: o.id,
      shopifyOrderName: o.shopifyOrderName,
      totalPrice: o.totalPrice,
      paymentMethod: o.paymentMethod,
      deliveredAt: o.deliveredAt!.toISOString(),
      items: o.items as unknown as OrderItem[],
      customerName: o.customer?.name ?? null,
      customerPhone: o.customer?.phone ?? null,
    }))
  }

  return json({ shopDomain, shopName: shop.name ?? shopDomain, eligibleOrders })
}

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const shopDomain = decodeURIComponent(params.shop ?? "")

  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    select: {
      id: true,
      aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true,
      waPhoneNumberId: true, waAccessToken: true,
    },
  })
  if (!shop) return json({ ok: false, error: "Shop not found" }, { status: 404 })

  const formData = await request.formData()
  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "").slice(-10)
  const orderId = String(formData.get("orderId") ?? "")
  const reason = String(formData.get("reason") ?? "")
  const reasonNote = formData.get("reasonNote") ? String(formData.get("reasonNote")) : null
  const refundMethod = String(formData.get("refundMethod") ?? "")
  const returnItemsRaw = formData.get("returnItems")

  if (!phone || phone.length !== 10) {
    return json({ ok: false, error: "Invalid phone number" }, { status: 400 })
  }
  if (!orderId || !reason || !refundMethod) {
    return json({ ok: false, error: "Missing required fields" }, { status: 400 })
  }

  // 1. Re-verify OTP token is still valid
  const otpEntry = await db.otpCode.findUnique({
    where: { shopId_phone: { shopId: shop.id, phone } },
  })
  if (!otpEntry || !otpEntry.used) {
    // used=true means OTP was verified; if not found or not used, session is invalid
    return json({ ok: false, error: "Session expired. Please verify your phone again." }, { status: 401 })
  }
  // Check expiry (allow 30-min window after OTP was marked used — generous for form fill)
  const sessionAge = Date.now() - otpEntry.expiresAt.getTime()
  if (sessionAge > 30 * 60 * 1000) {
    return json({ ok: false, error: "Session expired. Please start over." }, { status: 401 })
  }

  // 2. Fetch the order and verify eligibility
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const order = await db.order.findFirst({
    where: {
      id: orderId,
      shopId: shop.id,
      status: "delivered",
      deliveredAt: { gte: sevenDaysAgo },
      customer: { phone },
    },
    select: {
      id: true,
      shopifyOrderName: true,
      totalPrice: true,
      items: true,
      customer: { select: { id: true, phone: true } },
    },
  })
  if (!order) {
    return json({ ok: false, error: "Order not eligible for return" }, { status: 400 })
  }

  // Check no existing non-rejected return request
  const existing = await db.returnRequest.findFirst({
    where: { orderId, status: { not: "rejected" } },
  })
  if (existing) {
    return json({ ok: false, error: "A return request already exists for this order" }, { status: 400 })
  }

  // 3. Parse and validate return items
  let returnItems: Array<{ title: string; quantity: number; price: number; reason: string }> = []
  try {
    returnItems = JSON.parse(String(returnItemsRaw ?? "[]"))
  } catch {
    return json({ ok: false, error: "Invalid return items" }, { status: 400 })
  }
  if (!returnItems.length) {
    return json({ ok: false, error: "Please select at least one item to return" }, { status: 400 })
  }

  // 4. Upload photos to Supabase Storage (best-effort — never blocks submission)
  const photoUrls: string[] = []
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (supabaseUrl && supabaseKey) {
    const photoFiles = formData.getAll("photos") as File[]
    for (const file of photoFiles.slice(0, 5)) {
      if (!file || !file.size) continue
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const path = `return-photos/${Date.now()}-${safeName}`
        const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": file.type || "image/jpeg",
          },
          body: await file.arrayBuffer(),
        })
        if (uploadRes.ok) {
          photoUrls.push(`${supabaseUrl}/storage/v1/object/public/${path}`)
        }
      } catch {
        // non-fatal — skip failed photo
      }
    }
  }

  // 5. Calculate refund amount
  const refundAmount = returnItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  // 6. Create ReturnRequest
  const returnRequest = await db.returnRequest.create({
    data: {
      shopId: shop.id,
      orderId: order.id,
      customerId: order.customer?.id ?? null,
      items: returnItems,
      reason,
      reasonNote,
      refundMethod,
      refundAmount,
      photoUrls,
      status: "pending",
    },
  })

  // 7. Queue WhatsApp confirmation (best-effort)
  const hasWhatsApp = !!(
    shop.aiSensyApiKey || shop.watiApiToken || shop.waPhoneNumberId
  )
  if (hasWhatsApp && order.customer?.id) {
    try {
      await queueCommunication({
        shopId: shop.id,
        customerId: order.customer.id,
        phone,
        channel: "whatsapp",
        triggerType: "return_confirmed",
        triggerRef: returnRequest.id,
        body: `Your return request for order ${order.shopifyOrderName} has been submitted. Request ID: ${returnRequest.id}. We'll review and reach out within 24 hours.`,
        priority: "high",
      })
    } catch (err) {
      // Non-fatal — don't fail the submission over comm queue errors
      console.error("[returns] comm queue error:", err)
    }
  }

  return json({
    ok: true,
    returnRequestId: returnRequest.id,
    refundAmount,
    orderName: order.shopifyOrderName,
  })
}

// ─── Page component ───────────────────────────────────────────────────────────

type Step = "phone" | "otp" | "orders" | "form" | "success"

const RETURN_REASONS = [
  { value: "quality_issue", label: "Quality issue" },
  { value: "wrong_item", label: "Wrong item sent" },
  { value: "not_needed", label: "Not needed anymore" },
  { value: "damaged", label: "Item damaged" },
  { value: "size_fit", label: "Wrong size/fit" },
  { value: "other", label: "Other" },
]

const REFUND_METHODS = [
  { value: "original_payment", label: "Original payment method" },
  { value: "store_credit", label: "Store credit" },
  { value: "bank_transfer", label: "Bank transfer" },
]

export default function ReturnsPage() {
  const { shopDomain, shopName, eligibleOrders } = useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()
  const submit = useSubmit()

  // Derive step from URL
  const urlStep = (searchParams.get("step") as Step) ?? "phone"
  const urlPhone = searchParams.get("phone") ?? ""
  const urlOrderId = searchParams.get("orderId") ?? ""

  // Local UI state
  const [phone, setPhone] = useState(urlPhone)
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""])
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [otpError, setOtpError] = useState("")

  // Return form state
  const [selectedOrderId, setSelectedOrderId] = useState(urlOrderId)
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({})
  const [reason, setReason] = useState("")
  const [reasonNote, setReasonNote] = useState("")
  const [refundMethod, setRefundMethod] = useState("original_payment")
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  // Success state
  const [successData, setSuccessData] = useState<{
    returnRequestId: string
    refundAmount: number
    orderName: string
  } | null>(null)

  const otpRefs = useRef<Array<HTMLInputElement | null>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedOrder = eligibleOrders.find((o) => o.id === selectedOrderId) ?? null

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function goTo(step: Step, extra?: Record<string, string>) {
    const p = new URLSearchParams(searchParams)
    p.set("step", step)
    if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v))
    setSearchParams(p, { replace: true })
    setErrorMsg("")
  }

  function handleOtpKey(i: number, val: string) {
    const digits = [...otpDigits]
    digits[i] = val.slice(-1)
    setOtpDigits(digits)
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
    if (!val && i > 0) otpRefs.current[i - 1]?.focus()
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 5)
    setPhotoFiles(files)
    const previews = files.map((f) => URL.createObjectURL(f))
    setPhotoPreviews(previews)
  }

  // ── API calls ─────────────────────────────────────────────────────────────────

  async function handleSendOTP() {
    const normalized = phone.replace(/\D/g, "").slice(-10)
    if (normalized.length !== 10) return
    setSending(true)
    setErrorMsg("")
    try {
      const res = await fetch("/api/checkout/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone: normalized, shopDomain }),
      })
      if (res.ok) {
        setOtpDigits(["", "", "", "", "", ""])
        goTo("otp", { phone: normalized })
      } else {
        const data = await res.json() as { error?: string }
        setErrorMsg(data.error ?? "Failed to send OTP. Please try again.")
      }
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
        body: JSON.stringify({ action: "verify", phone: urlPhone, shopDomain, code }),
      })
      const data = await res.json() as { ok: boolean; verified?: boolean; error?: string }
      if (data.verified) {
        goTo("orders", { phone: urlPhone })
      } else {
        setOtpError(data.error ?? "Incorrect OTP. Please try again.")
      }
    } finally {
      setVerifying(false)
    }
  }

  async function handleSubmitReturn() {
    if (!selectedOrder) return
    if (!reason) { setErrorMsg("Please select a return reason"); return }
    const returnItems = selectedOrder.items
      .map((item, idx) => ({ ...item, quantity: returnQtys[idx] ?? 0, reason }))
      .filter((item) => item.quantity > 0)
    if (!returnItems.length) { setErrorMsg("Please select at least one item to return"); return }

    setSubmitting(true)
    setErrorMsg("")

    const fd = new FormData()
    fd.append("phone", urlPhone)
    fd.append("orderId", selectedOrder.id)
    fd.append("reason", reason)
    fd.append("reasonNote", reasonNote)
    fd.append("refundMethod", refundMethod)
    fd.append("returnItems", JSON.stringify(returnItems))
    photoFiles.forEach((f) => fd.append("photos", f))

    try {
      const res = await fetch(`/returns/${shopDomain}`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json() as {
        ok: boolean
        returnRequestId?: string
        refundAmount?: number
        orderName?: string
        error?: string
      }
      if (data.ok && data.returnRequestId) {
        setSuccessData({
          returnRequestId: data.returnRequestId,
          refundAmount: data.refundAmount ?? 0,
          orderName: data.orderName ?? selectedOrder.shopifyOrderName,
        })
        goTo("success")
      } else {
        setErrorMsg(data.error ?? "Submission failed. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const STEPS: Step[] = ["phone", "otp", "orders", "form"]
  const stepIndex = STEPS.indexOf(urlStep)

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>P</div>
        <span style={styles.shopName}>{shopName}</span>
        <span style={styles.headerTag}>Returns Portal</span>
      </header>

      <div style={styles.container}>
        {/* Step indicator */}
        {urlStep !== "success" && (
          <div style={styles.stepRow}>
            {STEPS.map((s, i) => (
              <div
                key={s}
                style={{
                  ...styles.stepDot,
                  background: i <= stepIndex ? "#6c63ff" : "rgba(255,255,255,0.1)",
                  boxShadow: i === stepIndex ? "0 0 8px rgba(108,99,255,0.6)" : "none",
                }}
              />
            ))}
          </div>
        )}

        {/* ── STEP 1: Phone ── */}
        {urlStep === "phone" && (
          <Card title="Start your return" subtitle="Enter your mobile number to get started">
            <label style={styles.label}>Mobile Number</label>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={styles.phonePrefixBox}>+91</span>
              <input
                style={{ ...styles.input, flex: 1 }}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                autoFocus
              />
            </div>
            {errorMsg && <ErrorText msg={errorMsg} />}
            <PrimaryBtn onClick={handleSendOTP} loading={sending} disabled={phone.replace(/\D/g, "").length !== 10}>
              Get OTP
            </PrimaryBtn>
            <p style={styles.hint}>We'll send a 6-digit code via WhatsApp to verify your identity</p>
          </Card>
        )}

        {/* ── STEP 2: OTP ── */}
        {urlStep === "otp" && (
          <Card title="Verify your number" subtitle={`OTP sent to +91 ${urlPhone}`}>
            <div style={styles.otpRow}>
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el }}
                  style={styles.otpBox}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOtpKey(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus()
                  }}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {otpError && <ErrorText msg={otpError} />}
            <PrimaryBtn
              onClick={handleVerifyOTP}
              loading={verifying}
              disabled={otpDigits.join("").length !== 6}
            >
              Verify
            </PrimaryBtn>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <GhostBtn onClick={handleSendOTP}>Resend OTP</GhostBtn>
              <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 8px" }}>·</span>
              <GhostBtn onClick={() => goTo("phone")}>Change number</GhostBtn>
            </div>
          </Card>
        )}

        {/* ── STEP 3: Order selection ── */}
        {urlStep === "orders" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={styles.cardTitle}>Select an order to return</h2>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 4 }}>
                Orders delivered in the last 7 days are eligible for returns.
              </p>
            </div>

            {eligibleOrders.length === 0 ? (
              <Card title="No eligible orders">
                <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.6 }}>
                    No orders are eligible for return right now.
                    <br />
                    Returns are accepted within 7 days of delivery.
                  </p>
                </div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {eligibleOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onSelect={() => {
                      setSelectedOrderId(order.id)
                      setReturnQtys({})
                      setReason("")
                      setReasonNote("")
                      goTo("form", { phone: urlPhone, orderId: order.id })
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Return form ── */}
        {urlStep === "form" && selectedOrder && (
          <div>
            <button
              onClick={() => goTo("orders", { phone: urlPhone })}
              style={styles.backBtn}
            >
              ← Back to orders
            </button>
            <Card title={`Return ${selectedOrder.shopifyOrderName}`}>
              {/* Item checklist */}
              <SectionLabel>Select items to return</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} style={styles.itemRow}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>{item.title}</div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>
                        ₹{item.price.toLocaleString("en-IN")} × {item.quantity} ordered
                      </div>
                    </div>
                    <div style={styles.qtyControl}>
                      <button
                        style={styles.qtyBtn}
                        onClick={() =>
                          setReturnQtys((prev) => ({
                            ...prev,
                            [idx]: Math.max(0, (prev[idx] ?? 0) - 1),
                          }))
                        }
                      >
                        −
                      </button>
                      <span style={{ color: "#fff", fontSize: 14, minWidth: 20, textAlign: "center" }}>
                        {returnQtys[idx] ?? 0}
                      </span>
                      <button
                        style={styles.qtyBtn}
                        onClick={() =>
                          setReturnQtys((prev) => ({
                            ...prev,
                            [idx]: Math.min(item.quantity, (prev[idx] ?? 0) + 1),
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Refund preview */}
              {(() => {
                const total = selectedOrder.items.reduce(
                  (sum, item, idx) => sum + item.price * (returnQtys[idx] ?? 0),
                  0
                )
                return total > 0 ? (
                  <div style={styles.refundBadge}>
                    Refund amount: <strong style={{ color: "#6c63ff" }}>₹{total.toLocaleString("en-IN")}</strong>
                  </div>
                ) : null
              })()}

              {/* Reason */}
              <SectionLabel>Reason for return</SectionLabel>
              <select
                style={styles.select}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Select a reason…</option>
                {RETURN_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              {/* Note */}
              <SectionLabel>Tell us more (optional)</SectionLabel>
              <textarea
                style={styles.textarea}
                placeholder="Describe the issue in your own words…"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={3}
              />

              {/* Refund method */}
              <SectionLabel>Refund method</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {REFUND_METHODS.map((m) => (
                  <label key={m.value} style={styles.radioRow}>
                    <input
                      type="radio"
                      name="refundMethod"
                      value={m.value}
                      checked={refundMethod === m.value}
                      onChange={() => setRefundMethod(m.value)}
                      style={{ accentColor: "#6c63ff" }}
                    />
                    <span style={{ color: refundMethod === m.value ? "#fff" : "rgba(255,255,255,0.6)", fontSize: 14 }}>
                      {m.label}
                    </span>
                  </label>
                ))}
              </div>

              {/* Photo upload */}
              <SectionLabel>Upload photos (optional)</SectionLabel>
              <div
                style={styles.photoUpload}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <span style={{ fontSize: 22, marginBottom: 4 }}>📷</span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                  Tap to upload images (up to 5)
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={handlePhotoChange}
              />
              {photoPreviews.length > 0 && (
                <div style={styles.previewRow}>
                  {photoPreviews.map((src, i) => (
                    <img key={i} src={src} alt={`preview ${i + 1}`} style={styles.previewThumb} />
                  ))}
                </div>
              )}

              {errorMsg && <ErrorText msg={errorMsg} />}

              <PrimaryBtn onClick={handleSubmitReturn} loading={submitting}>
                Submit Return Request
              </PrimaryBtn>
            </Card>
          </div>
        )}

        {/* ── STEP 5: Success ── */}
        {urlStep === "success" && successData && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
              Return request submitted!
            </h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 24 }}>
              We'll review your request and reach out within 24 hours.
            </p>

            <div style={styles.successCard}>
              <div style={styles.successRow}>
                <span style={styles.successLabel}>Request ID</span>
                <span style={styles.successValue}>{successData.returnRequestId.slice(0, 12)}…</span>
              </div>
              <div style={styles.successRow}>
                <span style={styles.successLabel}>Order</span>
                <span style={styles.successValue}>{successData.orderName}</span>
              </div>
              <div style={styles.successDivider} />
              <div style={styles.successRow}>
                <span style={{ ...styles.successLabel, fontSize: 13 }}>Estimated refund</span>
                <span style={{ ...styles.successValue, color: "#6c63ff", fontSize: 17, fontWeight: 700 }}>
                  ₹{successData.refundAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 24 }}>
              You'll receive a WhatsApp confirmation shortly.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>{title}</h2>
      {subtitle && <p style={styles.cardSubtitle}>{subtitle}</p>}
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={styles.sectionLabel}>{children}</div>
}

function OrderCard({
  order,
  onSelect,
}: {
  order: EligibleOrder
  onSelect: () => void
}) {
  const daysAgo = Math.floor(
    (Date.now() - new Date(order.deliveredAt).getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysLeft = 7 - daysAgo

  return (
    <div style={styles.orderCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{order.shopifyOrderName}</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>
            Delivered {daysAgo === 0 ? "today" : `${daysAgo}d ago`} · {daysLeft}d left to return
          </div>
        </div>
        <div style={{ color: "#6c63ff", fontSize: 15, fontWeight: 700 }}>
          ₹{order.totalPrice.toLocaleString("en-IN")}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
        {order.items.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>{item.title} ×{item.quantity}</span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>₹{(item.price * item.quantity).toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>

      <button onClick={onSelect} style={styles.startReturnBtn}>
        Start Return →
      </button>
    </div>
  )
}

function PrimaryBtn({
  onClick,
  loading,
  disabled,
  children,
}: {
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        ...styles.primaryBtn,
        opacity: loading || disabled ? 0.5 : 1,
        cursor: loading || disabled ? "not-allowed" : "pointer",
      }}
    >
      {loading ? "Please wait…" : children}
    </button>
  )
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={styles.ghostBtn}>
      {children}
    </button>
  )
}

function ErrorText({ msg }: { msg: string }) {
  return (
    <p style={{ color: "#ff6b6b", fontSize: 13, margin: "8px 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
      <span>⚠</span> {msg}
    </p>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f0f13",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#fff",
  } as React.CSSProperties,

  header: {
    background: "rgba(255,255,255,0.03)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    padding: "14px 20px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  } as React.CSSProperties,

  logo: {
    width: 32,
    height: 32,
    background: "#6c63ff",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  } as React.CSSProperties,

  shopName: {
    fontWeight: 600,
    fontSize: 15,
    color: "#fff",
  } as React.CSSProperties,

  headerTag: {
    marginLeft: "auto",
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.06)",
    padding: "4px 10px",
    borderRadius: 20,
  } as React.CSSProperties,

  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "28px 16px 48px",
  } as React.CSSProperties,

  stepRow: {
    display: "flex",
    gap: 6,
    marginBottom: 28,
  } as React.CSSProperties,

  stepDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    transition: "background 0.3s, box-shadow 0.3s",
  } as React.CSSProperties,

  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  } as React.CSSProperties,

  cardTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#fff",
    margin: "0 0 4px",
  } as React.CSSProperties,

  cardSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    margin: "0 0 20px",
  } as React.CSSProperties,

  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 8,
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 10,
    marginTop: 20,
  } as React.CSSProperties,

  input: {
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 15,
    color: "#fff",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
    marginBottom: 16,
  } as React.CSSProperties,

  phonePrefixBox: {
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
    fontWeight: 600,
    flexShrink: 0,
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
  } as React.CSSProperties,

  hint: {
    textAlign: "center" as const,
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    marginTop: 12,
  } as React.CSSProperties,

  otpRow: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    marginBottom: 20,
  } as React.CSSProperties,

  otpBox: {
    width: 44,
    height: 52,
    textAlign: "center" as const,
    fontSize: 22,
    fontWeight: 700,
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    color: "#fff",
    outline: "none",
    fontFamily: "inherit",
  } as React.CSSProperties,

  primaryBtn: {
    width: "100%",
    padding: "14px 0",
    background: "#6c63ff",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
    transition: "opacity 0.2s",
  } as React.CSSProperties,

  ghostBtn: {
    background: "none",
    border: "none",
    color: "#6c63ff",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    fontFamily: "inherit",
  } as React.CSSProperties,

  backBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    marginBottom: 16,
    fontFamily: "inherit",
    display: "block",
  } as React.CSSProperties,

  orderCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 20,
  } as React.CSSProperties,

  startReturnBtn: {
    width: "100%",
    padding: "11px 0",
    background: "rgba(108,99,255,0.15)",
    border: "1px solid rgba(108,99,255,0.35)",
    borderRadius: 10,
    color: "#6c63ff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.2s",
  } as React.CSSProperties,

  itemRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
  } as React.CSSProperties,

  qtyControl: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  } as React.CSSProperties,

  qtyBtn: {
    width: 28,
    height: 28,
    background: "rgba(108,99,255,0.18)",
    border: "1px solid rgba(108,99,255,0.3)",
    borderRadius: 6,
    color: "#6c63ff",
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    lineHeight: 1,
    fontFamily: "inherit",
  } as React.CSSProperties,

  refundBadge: {
    background: "rgba(108,99,255,0.12)",
    border: "1px solid rgba(108,99,255,0.25)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 4,
  } as React.CSSProperties,

  select: {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 14,
    color: "#fff",
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
    marginBottom: 4,
    appearance: "none" as const,
    cursor: "pointer",
  } as React.CSSProperties,

  textarea: {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 14,
    color: "#fff",
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
    resize: "vertical" as const,
    marginBottom: 4,
    lineHeight: 1.5,
  } as React.CSSProperties,

  radioRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8,
    cursor: "pointer",
  } as React.CSSProperties,

  photoUpload: {
    border: "1.5px dashed rgba(255,255,255,0.15)",
    borderRadius: 10,
    padding: "20px 0",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    cursor: "pointer",
    marginBottom: 12,
    gap: 4,
  } as React.CSSProperties,

  previewRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 16,
  } as React.CSSProperties,

  previewThumb: {
    width: 64,
    height: 64,
    objectFit: "cover" as const,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.1)",
  } as React.CSSProperties,

  successCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: "20px 24px",
    textAlign: "left" as const,
    maxWidth: 360,
    margin: "0 auto",
  } as React.CSSProperties,

  successRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
  } as React.CSSProperties,

  successLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  } as React.CSSProperties,

  successValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
  } as React.CSSProperties,

  successDivider: {
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "8px 0",
  } as React.CSSProperties,
} as const
