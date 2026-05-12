import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { Link, Outlet, useLoaderData, useLocation, useRouteError } from "@remix-run/react"
import { boundary } from "@shopify/shopify-app-remix/server"
import { AppProvider } from "@shopify/shopify-app-remix/react"
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"
import { authenticate } from "../shopify.server"

export const links = () => [{ rel: "stylesheet", href: polarisStyles }]

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request)
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" })
}

const NAV_ITEMS = [
  { to: "/app",              label: "Dashboard" },
  { to: "/app/customers",    label: "Customers" },
  { to: "/app/automations",  label: "Automations" },
  { to: "/app/chat",         label: "AI Chat" },
  { to: "/app/settings",     label: "Settings" },
]

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>()
  const location = useLocation()

  return (
    <AppProvider isEmbeddedApp={false} apiKey={apiKey}>
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
        {/* Sidebar */}
        <nav style={{
          width: 220,
          background: "#1a1a2e",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          padding: "24px 0",
          flexShrink: 0,
        }}>
          <div style={{ padding: "0 20px 24px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>
              ⚡ Pulseback
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>D2C Operating System</div>
          </div>

          <div style={{ flex: 1, padding: "16px 0" }}>
            {NAV_ITEMS.map(({ to, label }) => {
              const active = location.pathname === to || (to !== "/app" && location.pathname.startsWith(to))
              return (
                <Link
                  key={to}
                  to={to}
                  style={{
                    display: "block",
                    padding: "10px 20px",
                    color: active ? "#fff" : "#aaa",
                    background: active ? "rgba(255,255,255,0.1)" : "transparent",
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: active ? 600 : 400,
                    borderLeft: active ? "3px solid #6c63ff" : "3px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                </Link>
              )
            })}
          </div>

          <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 11, color: "#555" }}>
            v1.0 · pulseback.fly.dev
          </div>
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, background: "#f6f6f7", overflow: "auto" }}>
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
