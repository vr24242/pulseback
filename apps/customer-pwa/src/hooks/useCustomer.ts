import { trpc } from "@/lib/trpc.js"

/**
 * Hook to fetch a customer's order by order name and phone
 */
export function useOrder(orderName: string, phone: string): any {
  return trpc.customer.getOrder.useQuery(
    { orderName, phone },
    {
      enabled: !!orderName && !!phone,
      staleTime: 30000, // 30 seconds
    }
  )
}

/**
 * Hook to check if a customer can initiate a return
 */
export function useCheckReturn(orderName: string) {
  return trpc.customer.checkReturn.useQuery(
    { orderName },
    {
      enabled: !!orderName,
      staleTime: 30000,
    }
  )
}

/**
 * Hook to initiate a return
 */
export function useStartReturn() {
  return trpc.customer.startReturn.useMutation({
    onSuccess: (data: any) => {
      // Optionally refetch after mutation
      console.log("Return initiated:", data)
    },
  })
}

/**
 * Hook to get customer's recent orders for reordering
 */
export function useRecentOrders(phone: string, limit = 10) {
  return trpc.customer.getRecentOrders.useQuery(
    { phone, limit },
    {
      enabled: !!phone,
      staleTime: 60000, // 1 minute
    }
  )
}
