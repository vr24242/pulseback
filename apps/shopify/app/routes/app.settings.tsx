import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react"
import { useState } from "react"
import { db } from "@d2c/database"
import { requireShop } from "../lib/shop.server"
import { getShiprocketToken, registerShiprocketWebhook } from "@d2c/core/shipping/shiprocket"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const shopDomain = url.searchParams.get("shop") ?? ""
  const shop = await requireShop(request)
  return json({ shop, domain: shopDomain })
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url)
  const shopDomain = url.searchParams.get("shop") ?? ""
  const formData = await request.formData()

  const shiprocketEmail = (formData.get("shiprocketEmail") as string) || undefined
  const shiprocketToken = (formData.get("shiprocketToken") as string) || undefined

  const updateData: Record<string, unknown> = {
    aiSensyApiKey:       (formData.get("aiSensyApiKey") as string)       || undefined,
    watiApiToken:        (formData.get("watiApiToken") as string)         || undefined,
    watiPhoneNumber:     (formData.get("watiPhoneNumber") as string)      || undefined,
    waPhoneNumberId:     (formData.get("waPhoneNumberId") as string)      || undefined,
    waAccessToken:       (formData.get("waAccessToken") as string)        || undefined,
    waBusinessAccountId: (formData.get("waBusinessAccountId") as string)  || undefined,
    waVerifyToken:       (formData.get("waVerifyToken") as string)        || undefined,
    shiprocketEmail,
    shiprocketToken,
    shiprocketWebhookSecret: (formData.get("shiprocketWebhookSecret") as string) || undefined,
    codBlockingEnabled:  formData.get("codBlockingEnabled") === "on",
    rtoThreshold:     parseInt(formData.get("rtoThreshold") as string)     || 60,
    dispatchSlaHours: parseInt(formData.get("dispatchSlaHours") as string) || 24,
    ownerName:        (formData.get("ownerName") as string)               || undefined,
    ownerPhone:       (formData.get("ownerPhone") as string)              || undefined,
    brandPrimaryColor:   (formData.get("brandPrimaryColor") as string)   || "#7c3aed",
    brandSecondaryColor: (formData.get("brandSecondaryColor") as string) || "#6366f1",
    logoUrl:             (formData.get("logoUrl") as string)             || undefined,
    checkoutFont:        (formData.get("checkoutFont") as string)        || "sans-serif",
  }

  // Try to auto-register webhook if Shiprocket credentials are provided
  if (shiprocketEmail && shiprocketToken) {
    try {
      const jwtToken = await getShiprocketToken(shiprocketEmail, shiprocketToken)
      const webhookResult = await registerShiprocketWebhook(jwtToken)
      updateData.shiprocketWebhookId = webhookResult.webhookId
      console.log(`[settings] Auto-registered Shiprocket webhook: ${webhookResult.webhookId}`)
    } catch (err) {
      // Webhook registration is not critical — log error but don't fail the whole request
      console.error("[settings] Webhook registration failed:", err instanceof Error ? err.message : String(err))
    }
  }

  await db.shop.update({
    where: { domain: shopDomain },
    data: updateData,
  })

  return json({ success: true })
}

// ─── shared styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 28,
}

const inputBase: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "10px 14px",
  color: "#e8e8f0",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
}

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "rgba(232,232,240,0.7)",
  marginBottom: 6,
  fontWeight: 500,
}

const helpText: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(232,232,240,0.45)",
  marginTop: 5,
}

const divider: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.06)",
  margin: "20px 0",
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "#e8e8f0",
  margin: 0,
}

const cardTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#e8e8f0",
  margin: 0,
}

const muted: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(232,232,240,0.5)",
  margin: 0,
  lineHeight: 1.5,
}

const badge = (color: "green" | "amber" | "purple"): React.CSSProperties => {
  const map = {
    green:  { bg: "rgba(52,211,153,0.12)", text: "#34d399", border: "rgba(52,211,153,0.2)" },
    amber:  { bg: "rgba(251,191,36,0.12)",  text: "#fbbf24", border: "rgba(251,191,36,0.2)" },
    purple: { bg: "rgba(108,99,255,0.15)",  text: "#a5a0ff", border: "rgba(108,99,255,0.25)" },
  }
  const c = map[color]
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
    borderRadius: 20,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
  }
}

const codeTile: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 10,
  padding: "14px 16px",
}

// ─── FocusInput — adds focus ring without React state explosion ───────────────

function Input({
  name,
  type = "text",
  placeholder,
  defaultValue,
  autoComplete,
}: {
  name: string
  type?: string
  placeholder?: string
  defaultValue?: string
  autoComplete?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      name={name}
      type={type}
      placeholder={placeholder}
      defaultValue={defaultValue}
      autoComplete={autoComplete ?? "off"}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase,
        borderColor: focused ? "#6c63ff" : "rgba(255,255,255,0.1)",
        transition: "border-color 0.15s",
      }}
    />
  )
}

function Field({
  label: lbl,
  name,
  type,
  placeholder,
  defaultValue,
  help,
  autoComplete,
  suffix,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  defaultValue?: string
  help?: string
  autoComplete?: string
  suffix?: string
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={name} style={label}>{lbl}</label>
      {suffix ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} autoComplete={autoComplete} />
          <span style={{ color: "rgba(232,232,240,0.4)", fontSize: 13, whiteSpace: "nowrap" }}>{suffix}</span>
        </div>
      ) : (
        <Input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} autoComplete={autoComplete} />
      )}
      {help && <p style={helpText}>{help}</p>}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Settings() {
  const { shop } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const nav = useNavigation()
  const saving = nav.state === "submitting"

  const waWebhookUrl = "https://pulseback.fly.dev/api/whatsapp/webhook"

  const hasAiSensy = !!shop?.aiSensyApiKey
  const hasWATI    = !!shop?.watiApiToken
  const hasMeta    = !!shop?.waPhoneNumberId
  const activeProvider = hasAiSensy ? "AiSensy" : hasWATI ? "WATI" : hasMeta ? "Meta Cloud API" : null

  const [webhookCopied, setWebhookCopied] = useState(false)

  function copyWebhook() {
    navigator.clipboard.writeText(waWebhookUrl).then(() => {
      setWebhookCopied(true)
      setTimeout(() => setWebhookCopied(false), 2000)
    })
  }

  const templates = [
    {
      name: "order_confirmed",
      params: "{{name}}, {{order_id}}, {{amount}}",
      use: "Sent on every prepaid order",
    },
    {
      name: "cod_confirmation",
      params: "{{name}}, {{order_id}}, {{amount}}",
      use: "Sent on COD — customer replies YES/NO",
    },
    {
      name: "abandoned_cart_recovery",
      params: "{{name}}, {{cart_value}}, {{discount_code}}",
      use: "Sent 30 min after cart abandonment",
    },
    {
      name: "order_dispatched",
      params: "{{name}}, {{order_id}}, {{awb}}, {{carrier}}",
      use: "Sent when shipment dispatched",
    },
  ]

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f13",
        padding: "32px 24px 80px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* ── Page Header ── */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#e8e8f0", margin: "0 0 6px" }}>
            Settings
          </h1>
          <p style={muted}>Configure WhatsApp, automations, and integrations</p>
        </div>

        {/* ── Shop ID Info ── */}
        <div style={{ ...card, marginBottom: 24, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <p style={{ ...muted, marginBottom: 8 }}>Your Shop ID (for PWA testing):</p>
          <div style={codeTile}>
            <code style={{ fontSize: 12, color: "#a5a0ff", fontFamily: "monospace", wordBreak: "break-all" }}>
              {shop?.id}
            </code>
          </div>
          <p style={{ ...muted, marginTop: 8, fontSize: 11 }}>Use this ID to generate JWT tokens for testing the Merchant and Customer PWAs.</p>
        </div>

        {/* ── Success / Error Banner ── */}
        {actionData?.success && (
          <div
            style={{
              ...card,
              background: "rgba(52,211,153,0.08)",
              border: "1px solid rgba(52,211,153,0.2)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
              padding: "16px 20px",
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            <div>
              <p style={{ margin: 0, color: "#34d399", fontWeight: 600, fontSize: 14 }}>Settings saved successfully</p>
              <p style={{ margin: 0, color: "rgba(52,211,153,0.7)", fontSize: 12 }}>All changes have been applied to your store.</p>
            </div>
          </div>
        )}

        <Form method="post">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* ── 1. WhatsApp Integration ── */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <h2 style={cardTitle}>WhatsApp Integration</h2>
                <span style={badge(activeProvider ? "green" : "amber")}>
                  {activeProvider ? `● Active: ${activeProvider}` : "○ Not configured"}
                </span>
              </div>
              <p style={{ ...muted, marginBottom: 20 }}>
                Configure one provider. Priority: AiSensy → WATI → Meta Cloud API.
              </p>

              {/* AiSensy */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <h3 style={{ ...sectionTitle, fontSize: 14 }}>Option 1: AiSensy</h3>
                  <span style={badge("green")}>★ Recommended for India</span>
                </div>
                <p style={{ ...muted, marginBottom: 14 }}>
                  Sign up at aisensy.com → API Keys → copy your API key. Activation takes 2-4 hours.
                </p>
                <Field
                  label="AiSensy API Key"
                  name="aiSensyApiKey"
                  type="password"
                  placeholder="your-aisensy-api-key"
                  defaultValue={shop?.aiSensyApiKey ?? ""}
                  help="From AiSensy Dashboard → Settings → API Keys"
                />
              </div>

              <div style={divider} />

              {/* WATI */}
              <div>
                <h3 style={{ ...sectionTitle, fontSize: 14, marginBottom: 8 }}>Option 2: WATI</h3>
                <p style={{ ...muted, marginBottom: 14 }}>
                  Sign up at wati.io → Settings → API → copy API URL and token.
                </p>
                <Field
                  label="WATI API URL"
                  name="watiPhoneNumber"
                  placeholder="https://live-server-12345.wati.io"
                  defaultValue={shop?.watiPhoneNumber ?? ""}
                  help="Your WATI server URL (found in API docs)"
                />
                <Field
                  label="WATI API Token"
                  name="watiApiToken"
                  type="password"
                  placeholder="eyJhbGciOi..."
                  defaultValue={shop?.watiApiToken ?? ""}
                />
              </div>

              <div style={divider} />

              {/* Meta Cloud API */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <h3 style={{ ...sectionTitle, fontSize: 14 }}>Option 3: Meta WhatsApp Cloud API</h3>
                  <span style={badge("amber")}>⚠ Requires business verification (1-7 days)</span>
                </div>
                <Field
                  label="Phone Number ID"
                  name="waPhoneNumberId"
                  placeholder="1234567890123"
                  defaultValue={shop?.waPhoneNumberId ?? ""}
                />
                <Field
                  label="Permanent Access Token"
                  name="waAccessToken"
                  type="password"
                  placeholder="EAAxxxxx..."
                  defaultValue=""
                />
                <Field
                  label="Business Account ID"
                  name="waBusinessAccountId"
                  placeholder="1234567890123"
                  defaultValue={shop?.waBusinessAccountId ?? ""}
                />
                <Field
                  label="Webhook Verify Token"
                  name="waVerifyToken"
                  placeholder="pulseback_verify"
                  defaultValue={shop?.waVerifyToken ?? "pulseback_verify"}
                  help={`Set this in Meta App → Webhooks → Callback URL (see webhook URL below)`}
                />
              </div>

              <div style={divider} />

              {/* Webhook URL */}
              <div>
                <p style={{ ...label, marginBottom: 8 }}>Webhook URL</p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <code style={{ flex: 1, fontSize: 12, color: "#a5a0ff", fontFamily: "'Fira Code', 'Courier New', monospace", wordBreak: "break-all" }}>
                    {waWebhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={copyWebhook}
                    style={{
                      background: webhookCopied ? "rgba(52,211,153,0.15)" : "rgba(108,99,255,0.15)",
                      border: `1px solid ${webhookCopied ? "rgba(52,211,153,0.3)" : "rgba(108,99,255,0.3)"}`,
                      borderRadius: 6,
                      color: webhookCopied ? "#34d399" : "#a5a0ff",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "5px 12px",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s",
                    }}
                  >
                    {webhookCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            {/* ── 2. WhatsApp Templates ── */}
            <div style={card}>
              <h2 style={{ ...cardTitle, marginBottom: 6 }}>WhatsApp Templates</h2>
              <p style={{ ...muted, marginBottom: 20 }}>
                Create these templates in your WhatsApp provider dashboard before automations will work.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {templates.map(t => (
                  <div key={t.name} style={codeTile}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <code style={{ fontSize: 13, color: "#a5a0ff", fontFamily: "'Fira Code', 'Courier New', monospace", fontWeight: 600 }}>
                        {t.name}
                      </code>
                    </div>
                    <p style={{ margin: "0 0 2px", fontSize: 12, color: "rgba(232,232,240,0.45)" }}>
                      <span style={{ color: "rgba(232,232,240,0.3)" }}>params: </span>
                      <code style={{ fontFamily: "'Fira Code', 'Courier New', monospace" }}>{t.params}</code>
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(232,232,240,0.45)" }}>
                      <span style={{ color: "rgba(232,232,240,0.3)" }}>use: </span>{t.use}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 3. Shiprocket ── */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <h2 style={cardTitle}>Shiprocket</h2>
                <span style={badge(shop?.shiprocketToken ? "green" : "amber")}>
                  {shop?.shiprocketToken ? "● Connected" : "○ Not connected"}
                </span>
              </div>
              <p style={{ ...muted, marginBottom: 20 }}>
                Connect Shiprocket to automatically track shipments and send dispatch notifications.
                Sign up at shiprocket.in → Settings → API.
              </p>
              <Field
                label="Shiprocket Email"
                name="shiprocketEmail"
                type="email"
                placeholder="you@yourbrand.com"
                defaultValue={shop?.shiprocketEmail ?? ""}
                autoComplete="email"
                help="The email you use to log in to Shiprocket"
              />
              <Field
                label="Shiprocket Password"
                name="shiprocketToken"
                type="password"
                placeholder={shop?.shiprocketToken ? "••••••••" : "Your Shiprocket password"}
                defaultValue=""
                help="Used to auto-generate API tokens for shipment tracking"
              />
              <Field
                label="Webhook Secret (Optional)"
                name="shiprocketWebhookSecret"
                type="password"
                placeholder={shop?.shiprocketWebhookSecret ? "••••••••" : "Webhook secret for signature verification"}
                defaultValue=""
                help="Shiprocket webhook secret for HMAC signature verification. Get from Shiprocket → Settings → Webhooks."
              />
            </div>

            {/* ── 4. Merchant Profile ── */}
            <div style={card}>
              <h2 style={{ ...cardTitle, marginBottom: 6 }}>Merchant Profile</h2>
              <p style={{ ...muted, marginBottom: 20 }}>
                Personalize your daily D2C briefing — sent each morning with key metrics and alerts.
              </p>
              <Field
                label="Your Name"
                name="ownerName"
                placeholder="Rahul"
                defaultValue={shop?.ownerName ?? ""}
                help="Used to personalize your daily briefing message"
              />
              <Field
                label="Your WhatsApp Number"
                name="ownerPhone"
                type="tel"
                placeholder="+91 98765 43210"
                defaultValue={shop?.ownerPhone ?? ""}
                help="Your daily D2C briefing will be sent here at 9 PM IST"
              />
            </div>

            {/* ── 5. Order Rules ── */}
            <div style={card}>
              <h2 style={{ ...cardTitle, marginBottom: 20 }}>Order Rules</h2>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    name="codBlockingEnabled"
                    defaultChecked={shop?.codBlockingEnabled !== false}
                    style={{
                      width: 18,
                      height: 18,
                      cursor: "pointer",
                      accentColor: "#6c63ff",
                    }}
                  />
                  <span style={{ color: "#e8e8f0", fontSize: 14, fontWeight: 500 }}>
                    Enable COD Blocking
                  </span>
                </label>
                <p style={helpText}>
                  When enabled, customers with high RTO scores will not see Cash on Delivery option at checkout
                </p>
              </div>

              <div style={divider} />

              <Field
                label="RTO Score Threshold — hide COD above this score"
                name="rtoThreshold"
                type="number"
                placeholder="60"
                defaultValue={String(shop?.rtoThreshold ?? 60)}
                suffix="/ 100"
                help="Customers scoring above this will not see Cash on Delivery at checkout (only if blocking is enabled)"
              />
              <Field
                label="Dispatch SLA"
                name="dispatchSlaHours"
                type="number"
                placeholder="24"
                defaultValue={String(shop?.dispatchSlaHours ?? 24)}
                suffix="hours"
                help="Hours you have to dispatch before the order is flagged as delayed"
              />
            </div>

            {/* ── 6. Checkout Branding ── */}
            <div style={card}>
              <h2 style={{ ...cardTitle, marginBottom: 6 }}>Checkout Branding</h2>
              <p style={{ ...muted, marginBottom: 20 }}>
                Customize the look and feel of your checkout page with your brand colors, logo, and fonts.
              </p>

              {/* Color Preview */}
              <div style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ ...label, marginBottom: 8 }}>Primary Color Preview</p>
                  <div
                    style={{
                      width: "100%",
                      height: 60,
                      borderRadius: 8,
                      background: shop?.brandPrimaryColor ?? "#7c3aed",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ ...label, marginBottom: 8 }}>Secondary Color Preview</p>
                  <div
                    style={{
                      width: "100%",
                      height: 60,
                      borderRadius: 8,
                      background: shop?.brandSecondaryColor ?? "#6366f1",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                </div>
              </div>

              <Field
                label="Primary Color (for buttons, links, headers)"
                name="brandPrimaryColor"
                type="color"
                defaultValue={shop?.brandPrimaryColor ?? "#7c3aed"}
                help="Used for primary call-to-action buttons, links, and main headers"
              />
              <Field
                label="Secondary Color (for accents)"
                name="brandSecondaryColor"
                type="color"
                defaultValue={shop?.brandSecondaryColor ?? "#6366f1"}
                help="Used for secondary buttons and accent elements"
              />
              <Field
                label="Logo URL"
                name="logoUrl"
                type="url"
                placeholder="https://cdn.example.com/logo.png"
                defaultValue={shop?.logoUrl ?? ""}
                help="HTTPS URL to your brand logo (PNG/JPG recommended, 200x200px)"
              />
              <Field
                label="Checkout Font"
                name="checkoutFont"
                placeholder="sans-serif"
                defaultValue={shop?.checkoutFont ?? "sans-serif"}
                help="Font family for checkout page (e.g., 'sans-serif', 'Georgia', 'Courier New')"
              />
            </div>

            {/* ── Save Button ── */}
            <button
              type="submit"
              disabled={saving}
              style={{
                width: "100%",
                background: saving ? "rgba(108,99,255,0.5)" : "#6c63ff",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "14px 24px",
                fontSize: 15,
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "background 0.15s, transform 0.1s",
                letterSpacing: "0.01em",
              }}
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>

          </div>
        </Form>
      </div>
    </div>
  )
}
