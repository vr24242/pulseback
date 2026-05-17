import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import crypto from "crypto"

const KEY_ID     = process.env.RAZORPAY_KEY_ID     ?? ""
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET  ?? ""
const RAZORPAY_BASE = "https://api.razorpay.com/v1"

// ─── Helper ───────────────────────────────────────────────────────────────────

async function razorpayRequest(path: string, body: Record<string, unknown>) {
  const credentials = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")
  const res = await fetch(`${RAZORPAY_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json() as {
    action: "create-order" | "verify"
    // create-order
    amount?: number          // in paise (₹ × 100)
    currency?: string
    receipt?: string
    // verify
    razorpay_order_id?: string
    razorpay_payment_id?: string
    razorpay_signature?: string
  }

  if (!KEY_ID || !KEY_SECRET) {
    return json({ ok: false, error: "Razorpay not configured" }, { status: 500 })
  }

  // ── Create Razorpay order ────────────────────────────────────────────────────
  if (body.action === "create-order") {
    if (!body.amount || body.amount < 100) {
      return json({ ok: false, error: "Invalid amount" }, { status: 400 })
    }

    const order = await razorpayRequest("/orders", {
      amount: Math.round(body.amount),       // paise, must be integer
      currency: body.currency ?? "INR",
      receipt: body.receipt ?? `rcpt_${Date.now()}`,
    }) as { id?: string; error?: { description: string } }

    if (!order.id) {
      console.error("[razorpay] create-order failed:", order)
      return json({ ok: false, error: order.error?.description ?? "Failed to create payment order" }, { status: 502 })
    }

    // Return orderId + public key to client — secret never leaves server
    return json({ ok: true, orderId: order.id, keyId: KEY_ID, amount: body.amount, currency: body.currency ?? "INR" })
  }

  // ── Verify payment signature ─────────────────────────────────────────────────
  if (body.action === "verify") {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ ok: false, error: "Missing payment verification fields" }, { status: 400 })
    }

    // HMAC-SHA256: orderId|paymentId signed with key_secret
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`
    const expectedSignature = crypto
      .createHmac("sha256", KEY_SECRET)
      .update(payload)
      .digest("hex")

    if (expectedSignature !== razorpay_signature) {
      console.error("[razorpay] signature mismatch — possible tampered payment")
      return json({ ok: false, error: "Payment verification failed" }, { status: 400 })
    }

    return json({ ok: true, paymentId: razorpay_payment_id })
  }

  return json({ ok: false, error: "Unknown action" }, { status: 400 })
}
