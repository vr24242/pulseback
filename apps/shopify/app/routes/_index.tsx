import type { LoaderFunctionArgs } from "@remix-run/node"
import { redirect } from "@remix-run/node"
import { db } from "@d2c/database"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const shop = url.searchParams.get("shop")

  if (!shop) {
    // No shop param — find the installed shop from DB
    const installed = await db.shop.findFirst({
      where: { isActive: true },
      select: { domain: true },
    })
    if (installed) return redirect(`/app?shop=${installed.domain}`)
    return redirect("/auth/login")
  }

  // If shop is in our DB (app installed) → go to app
  const shopRecord = await db.shop.findUnique({
    where: { domain: shop },
    select: { isActive: true },
  })

  if (shopRecord?.isActive) {
    return redirect(`/app?shop=${shop}`)
  }

  // Not installed → OAuth via auth route
  return redirect(`/auth/login?shop=${shop}`)
}
