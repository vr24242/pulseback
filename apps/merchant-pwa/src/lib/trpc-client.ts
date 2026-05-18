import { httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import { getToken } from "./auth.js"
import { trpc } from "./trpc.js"

/**
 * Create tRPC client with JWT auth header
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${import.meta.env.VITE_API_URL || "https://pulseback.fly.dev"}/trpc`,
        transformer: superjson,
        headers() {
          const token = getToken()
          return {
            authorization: token ? `Bearer ${token}` : "",
          }
        },
        fetch(url: string, options: any) {
          return fetch(url, {
            ...options,
            credentials: "include",
          })
        },
      } as any),
    ],
  })
}
