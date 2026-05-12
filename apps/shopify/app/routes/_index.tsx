import type { LoaderFunctionArgs } from "@remix-run/node"
import { redirect } from "@remix-run/node"
import { login } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)

  if (url.searchParams.get("shop")) {
    // login() returns a Response (redirect to Shopify OAuth)
    return login(request)
  }

  return redirect("/app")
}
