import { httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import { getToken } from "./auth.js"
import type { AppRouter } from "@d2c/api"
import { trpc } from "./trpc.js"

/**
 * Create tRPC client with JWT auth header
 */
export function createTRPCClient() {
  const apiUrl = import.meta.env.VITE_API_URL || "https://pulseback.fly.dev"
  const finalUrl = `${apiUrl}/trpc`

  // Log the API URL for debugging
  console.log('[tRPC] API URL:', finalUrl)
  if (typeof window !== 'undefined') {
    console.log('[tRPC] VITE_API_URL env:', import.meta.env.VITE_API_URL)
  }

  return trpc.createClient({
    links: [
      httpBatchLink({
        url: finalUrl,
        transformer: superjson,
        headers() {
          const token = getToken()
          return {
            authorization: token ? `Bearer ${token}` : "",
          }
        },
        fetch(url: string, options: any) {
          console.log('[tRPC] Fetch request:', url)
          return fetch(url, {
            ...options,
            credentials: "include",
          })
        },
      } as any),
    ],
  })
}
