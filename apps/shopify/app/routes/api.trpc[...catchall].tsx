import type { LoaderFunctionArgs } from "@remix-run/node"

/**
 * tRPC API Handler (Phase 3.1 PWA support)
 * Stub endpoint - full tRPC integration in Phase 4
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  // Health check
  if (pathname.includes("/health")) {
    return new Response(
      JSON.stringify({
        status: "ok",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }

  // Placeholder
  return new Response(
    JSON.stringify({
      error: "tRPC endpoints coming soon",
      status: "development",
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  )
}

export async function action({ request }: LoaderFunctionArgs) {
  return loader({ request })
}
