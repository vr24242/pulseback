import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '@d2c/api'
import { getToken } from './auth'

export const trpc = createTRPCProxyClient<AppRouter>({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_API_URL || 'https://pulseback.fly.dev/trpc',
      fetch: async (input, init?) => {
        const token = getToken()
        return fetch(input, {
          ...init,
          headers: {
            ...init?.headers,
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        })
      },
    }),
  ],
})
