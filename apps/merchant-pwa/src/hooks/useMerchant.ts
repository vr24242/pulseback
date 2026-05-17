import { trpc } from "@/lib/trpc.js"

/**
 * Hook to fetch merchant's recent orders
 */
export function useOrders() {
  return trpc.merchant.orders.useQuery(undefined, {
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  })
}

/**
 * Hook to fetch merchant's customers
 */
export function useCustomers() {
  return trpc.merchant.customers.useQuery(undefined, {
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch Non-Delivery Returns (NDR) - stuck shipments
 */
export function useNDRQueue() {
  return trpc.merchant.ndr.useQuery(undefined, {
    staleTime: 20000, // 20 seconds
    refetchInterval: 45000, // Refetch every 45 seconds
  })
}

/**
 * Hook to fetch pending returns
 */
export function useReturnsQueue() {
  return trpc.merchant.returns.useQuery(undefined, {
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  })
}

/**
 * Hook to approve or reject a return
 */
export function useApproveReturn() {
  const utils = trpc.useUtils()
  return trpc.merchant.approveReturn.useMutation({
    onSuccess: () => {
      // Invalidate returns query to refresh
      utils.merchant.returns.invalidate()
    },
  })
}

/**
 * Hook to handle NDR decision (reattempt, address update, or RTO)
 */
export function useApproveNDR() {
  const utils = trpc.useUtils()
  return trpc.merchant.approveNDR.useMutation({
    onSuccess: () => {
      // Invalidate NDR query to refresh
      utils.merchant.ndr.invalidate()
    },
  })
}
