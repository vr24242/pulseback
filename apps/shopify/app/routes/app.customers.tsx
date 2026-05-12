import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, Link } from "@remix-run/react"
import {
  Page, Card, DataTable, Badge, Text, BlockStack,
} from "@shopify/polaris"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const url = new URL(request.url)
  const stage = url.searchParams.get("stage") ?? undefined

  const shop = await db.shop.findUnique({ where: { domain: session.shop } })
  if (!shop) throw new Response("Not found", { status: 404 })

  const customers = await db.customer.findMany({
    where: {
      shopId: shop.id,
      ...(stage ? { lifecycleStage: stage } : {}),
    },
    orderBy: { ltv: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      ltv: true,
      totalOrders: true,
      lifecycleStage: true,
      ltvTier: true,
      churnScore: true,
      lastOrderAt: true,
    },
  })

  return json({ customers })
}

const STAGE_BADGE: Record<string, "success" | "warning" | "critical" | "info" | undefined> = {
  vip: "success",
  loyal: "success",
  repeat: "info",
  first_buyer: "info",
  at_risk: "warning",
  lapsed: "critical",
  prospect: undefined,
}

export default function CustomersPage() {
  const { customers } = useLoaderData<typeof loader>()

  const rows = customers.map((c) => [
    c.name ?? "—",
    c.phone ?? c.email ?? "—",
    `₹${c.ltv.toLocaleString("en-IN")}`,
    c.totalOrders,
    <Badge tone={STAGE_BADGE[c.lifecycleStage]}>{c.lifecycleStage}</Badge>,
    c.churnScore,
    c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("en-IN") : "—",
  ])

  return (
    <Page title="Customers">
      <Card>
        <DataTable
          columnContentTypes={["text", "text", "text", "numeric", "text", "numeric", "text"]}
          headings={["Name", "Contact", "LTV", "Orders", "Stage", "Churn Score", "Last Order"]}
          rows={rows}
        />
      </Card>
    </Page>
  )
}
