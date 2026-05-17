import { createTRPCReact } from "@trpc/react-query"
import type { AppRouter } from "@d2c/api"

export const trpc = createTRPCReact<AppRouter>()
