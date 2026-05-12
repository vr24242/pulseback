import type { LoaderFunctionArgs } from "@remix-run/node"
import { redirect } from "@remix-run/node"
import { login } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const shop = url.searchParams.get("shop")
  const hmac = url.searchParams.get("hmac")

  // Fresh install — no hmac yet, start OAuth
  if (shop && !hmac) {
    return login(request)
  }

  // Post-OAuth redirect from Shopify (has hmac+session) — go to app
  if (shop && hmac) {
    return redirect(`/app?${url.searchParams.toString()}`)
  }

  return redirect("/app")
}
