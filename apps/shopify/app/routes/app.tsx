import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node"
import { json, redirect } from "@remix-run/node"
import { Link, Outlet, useLoaderData, useLocation, useRouteError } from "@remix-run/react"
import { boundary } from "@shopify/shopify-app-remix/server"
import { AppProvider } from "@shopify/shopify-app-remix/react"
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"
import { db } from "@d2c/database"

export const links = () => [{ rel: "stylesheet", href: polarisStyles }]

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const shop = url.searchParams.get("shop")

  if (shop) {
    const shopRecord = await db.shop.findUnique({
      where: { domain: shop },
      select: { isActive: true },
    })
    if (!shopRecord?.isActive) {
      return redirect(`/auth/login?shop=${shop}`)
    }
    return json({ apiKey: process.env.SHOPIFY_API_KEY || "", shop, shopDomain: shop })
  }

  // No shop param — try to find the only shop in DB, preserve current path
  const shopRecord = await db.shop.findFirst({
    where: { isActive: true },
    select: { domain: true },
  })
  if (shopRecord) {
    const destPath = url.pathname + `?shop=${shopRecord.domain}`
    return redirect(destPath)
  }

  return redirect("/")
}

const NAV_ITEMS = [
  { to: "/app",              label: "Dashboard",    icon: "⚡" },
  { to: "/app/customers",    label: "Customers",    icon: "👥" },
  { to: "/app/orders",       label: "Orders",       icon: "🛍️" },
  { to: "/app/ndr",          label: "NDR",          icon: "📦" },
  { to: "/app/returns",      label: "Returns",      icon: "↩️" },
  { to: "/app/finance",      label: "Finance",      icon: "💰" },
  { to: "/app/inventory",    label: "Inventory",    icon: "🗃️" },
  { to: "/app/marketing",    label: "Marketing",    icon: "📣" },
  { to: "/app/automations",  label: "Automations",  icon: "⚙️" },
  { to: "/app/analytics",    label: "Analytics",    icon: "📊" },
  { to: "/app/chat",         label: "AI Chat",      icon: "🤖" },
  { to: "/app/settings",     label: "Settings",     icon: "🔧" },
]

export default function App() {
  const { apiKey, shopDomain } = useLoaderData<typeof loader>()
  const location = useLocation()
  const shopParam = shopDomain ? `?shop=${shopDomain}` : ""

  return (
    <AppProvider isEmbeddedApp={false} apiKey={apiKey}>
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', -apple-system, sans-serif", background: "#0f0f13" }}>
        {/* Sidebar */}
        <nav style={{
          width: 232,
          background: "linear-gradient(180deg, #13131f 0%, #0f0f1a 100%)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}>
          {/* Logo */}
          <div style={{ padding: "24px 20px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: "linear-gradient(135deg, #6c63ff, #a855f7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
                boxShadow: "0 4px 12px rgba(108,99,255,0.4)",
              }}>⚡</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.3px" }}>
                  Pulseback
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 1, letterSpacing: "0.02em" }}>
                  D2C OS
                </div>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <div style={{ flex: 1, padding: "8px 10px" }}>
            {NAV_ITEMS.map(({ to, label, icon }) => {
              const active = location.pathname === to || (to !== "/app" && location.pathname.startsWith(to))
              return (
                <Link
                  key={to}
                  to={`${to}${shopParam}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 9,
                    color: active ? "#f1f5f9" : "#64748b",
                    background: active ? "rgba(108,99,255,0.15)" : "transparent",
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    marginBottom: 2,
                    transition: "all 0.15s",
                    border: active ? "1px solid rgba(108,99,255,0.25)" : "1px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
                  {label}
                  {active && (
                    <div style={{
                      marginLeft: "auto", width: 6, height: 6,
                      borderRadius: "50%", background: "#6c63ff",
                      boxShadow: "0 0 8px #6c63ff",
                    }} />
                  )}
                </Link>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "16px 20px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11, color: "#334155",
          }}>
            <div style={{ color: "#475569", marginBottom: 2 }}>v1.0 · pulseback.fly.dev</div>
            <div style={{ color: "#1e293b" }}>© 2025 Pulseback</div>
          </div>
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, overflow: "auto", background: "#0f0f13" }}>
          <Outlet />
        </main>
      </div>
    </AppProvider>
  )
}

export function ErrorBoundary() {
  const error = useRouteError()
  return boundary.error(error)
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs)
}
