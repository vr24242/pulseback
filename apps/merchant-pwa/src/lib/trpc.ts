import { createTRPCReact } from "@trpc/react-query"

// Type: AppRouter from @d2c/api
// In production, this is loaded dynamically via tRPC client
export const trpc = createTRPCReact<any>()
