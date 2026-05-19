/**
 * tRPC API Handler
 * Routes all tRPC requests through the packages/api router
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "@d2c/api"
import { createContext } from "@d2c/api"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url)

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  // Debug: Log all tRPC requests
  console.log(`[tRPC] ${request.method} ${url.pathname}`)

  try {
    // tRPC request handler
    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: request,
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        console.error(`[tRPC] Error on ${path}:`, error)
      },
    })

    // Add CORS headers to response
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")

    return response
  } catch (error) {
    console.error("[tRPC] Handler error:", error)
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }
}

export async function action({ request }: { request: Request }) {
  return loader({ request })
}
