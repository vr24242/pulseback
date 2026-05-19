/**
 * tRPC API Handler
 * Unified API endpoint for all web surfaces (Customer PWA, Merchant PWA, etc.)
 *
 * Route: /api/trpc/*
 *
 * Example endpoints:
 * - /api/trpc/health?input={}
 * - /api/trpc/customer.getOrder?input={...}
 * - /api/trpc/merchant.orders?input={}
 *
 * NOTE: tRPC is currently in development. Using stub health endpoint.
 * Full PWA integration will be available after Phase 3.1 testing completes.
 */

import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"

/**
 * Stub health endpoint for tRPC API
 * TODO: Integrate full tRPC router once package dependencies resolved
 */
export async function loader({ request }: LoaderFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  // Health check endpoint for now
  if (new URL(request.url).pathname.includes("/health")) {
    return json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  }

  // Placeholder for tRPC endpoints
  return json(
    {
      error: "tRPC endpoints under construction",
      status: "coming_soon",
      docs: "See README.md for Phase 3 PWA integration details",
    },
    {
      status: 503,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  )
}

export async function action({ request }: LoaderFunctionArgs) {
  return loader({ request })
}
