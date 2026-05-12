import type { LoaderFunctionArgs } from "@remix-run/node"
import { redirect } from "@remix-run/node"
import { login } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)

  if (url.searchParams.get("shop")) {
    // Kick off OAuth install flow
    throw redirect(await login(request))
  }

  return redirect("/app")
}
