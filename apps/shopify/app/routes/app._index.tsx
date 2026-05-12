import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
} from "@shopify/polaris"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    select: { id: true, name: true },
  })
  if (!shop) throw new Response("Shop not found", { status: 404 })

  const [totalCustomers, totalOrders, atRiskCount, todayRevenue] = await Promise.all([
    db.customer.count({ where: { shopId: shop.id } }),
    db.order.count({ where: { shopId: shop.id } }),
    db.customer.count({ where: { shopId: shop.id, lifecycleStage: "at_risk" } }),
    db.order.aggregate({
      where: {
        shopId: shop.id,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        status: { notIn: ["cancelled"] },
      },
      _sum: { totalPrice: true },
    }),
  ])

  return json({
    shopName: shop.name ?? session.shop,
    stats: {
      totalCustomers,
      totalOrders,
      atRiskCount,
      todayRevenue: todayRevenue._sum.totalPrice ?? 0,
    },
  })
}

export default function Index() {
  const { shopName, stats } = useLoaderData<typeof loader>()

  return (
    <Page title={`${shopName} — D2C OS`}>
      <BlockStack gap="500">
        <InlineGrid columns={4} gap="400">
          <StatCard title="Today's Revenue" value={`₹${stats.todayRevenue.toLocaleString("en-IN")}`} />
          <StatCard title="Total Customers" value={stats.totalCustomers.toLocaleString()} />
          <StatCard title="Total Orders" value={stats.totalOrders.toLocaleString()} />
          <StatCard
            title="At-Risk Customers"
            value={stats.atRiskCount.toLocaleString()}
            highlight={stats.atRiskCount > 0}
          />
        </InlineGrid>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Ask your AI</Text>
                <Text as="p" tone="subdued">
                  Chat with Claude about your store data — customers, orders, revenue, retention.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  )
}

function StatCard({
  title,
  value,
  highlight,
}: {
  title: string
  value: string
  highlight?: boolean
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" tone="subdued" variant="bodySm">{title}</Text>
        <Text as="p" variant="headingLg" tone={highlight ? "caution" : undefined}>{value}</Text>
      </BlockStack>
    </Card>
  )
}
