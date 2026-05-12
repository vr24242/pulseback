import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useNavigate } from "@remix-run/react"
import {
  Page, Layout, Card, Text, BlockStack, InlineGrid,
  DataTable, Badge, Button, InlineStack, Divider, Box,
} from "@shopify/polaris"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = await db.shop.findUnique({ where: { domain: session.shop } })
  if (!shop) throw new Response("Shop not found", { status: 404 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    totalCustomers, totalOrders, atRiskCount, todayRevenue,
    codOrders, rtoOrders, abandonedToday, recentCustomers,
  ] = await Promise.all([
    db.customer.count({ where: { shopId: shop.id } }),
    db.order.count({ where: { shopId: shop.id } }),
    db.customer.count({ where: { shopId: shop.id, lifecycleStage: "at_risk" } }),
    db.order.aggregate({
      where: { shopId: shop.id, createdAt: { gte: today }, status: { notIn: ["cancelled"] } },
      _sum: { totalPrice: true },
    }),
    db.order.count({ where: { shopId: shop.id, paymentMethod: "cod", createdAt: { gte: today } } }),
    db.order.count({ where: { shopId: shop.id, isRTO: true } }),
    db.checkoutSession.count({
      where: { shopId: shop.id, status: "abandoned", abandonedAt: { gte: today } },
    }),
    db.customer.findMany({
      where: { shopId: shop.id },
      orderBy: { lastSeenAt: "desc" },
      take: 8,
      select: {
        id: true, name: true, phone: true, email: true,
        lifecycleStage: true, ltvTier: true, totalOrders: true,
        totalSpend: true, rtoRiskScore: true, lastSeenAt: true,
      },
    }),
  ])

  return json({
    shopName: shop.name ?? session.shop,
    stats: {
      totalCustomers,
      totalOrders,
      atRiskCount,
      todayRevenue: todayRevenue._sum.totalPrice ?? 0,
      codOrders,
      rtoOrders,
      abandonedToday,
    },
    recentCustomers,
  })
}

export default function Dashboard() {
  const { shopName, stats, recentCustomers } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  const rows = recentCustomers.map((c) => [
    <Text as="span" variant="bodySm" fontWeight="semibold">{c.name ?? c.phone ?? c.email ?? "—"}</Text>,
    <Badge tone={stageTone(c.lifecycleStage)}>{c.lifecycleStage.replace("_", " ")}</Badge>,
    <Badge tone={tierTone(c.ltvTier)}>{c.ltvTier}</Badge>,
    c.totalOrders.toString(),
    `₹${c.totalSpend.toLocaleString("en-IN")}`,
    <Badge tone={c.rtoRiskScore > 60 ? "critical" : c.rtoRiskScore > 40 ? "caution" : "success"}>
      {c.rtoRiskScore}
    </Badge>,
    <Button size="slim" onClick={() => navigate(`/app/customers`)}>View</Button>,
  ])

  return (
    <Page title={`${shopName}`} subtitle="D2C Operating System">
      <BlockStack gap="500">

        {/* KPI Row */}
        <InlineGrid columns={4} gap="400">
          <StatCard title="Today's Revenue" value={`₹${stats.todayRevenue.toLocaleString("en-IN")}`} />
          <StatCard title="Total Customers" value={stats.totalCustomers.toLocaleString()} />
          <StatCard title="COD Orders Today" value={stats.codOrders.toString()} />
          <StatCard title="Abandoned Today" value={stats.abandonedToday.toString()} highlight={stats.abandonedToday > 0} />
        </InlineGrid>

        <InlineGrid columns={4} gap="400">
          <StatCard title="Total Orders" value={stats.totalOrders.toLocaleString()} />
          <StatCard title="RTO Orders" value={stats.rtoOrders.toString()} highlight={stats.rtoOrders > 0} />
          <StatCard title="At-Risk Customers" value={stats.atRiskCount.toString()} highlight={stats.atRiskCount > 0} />
          <Card>
            <BlockStack gap="200">
              <Text as="p" tone="subdued" variant="bodySm">AI Assistant</Text>
              <Button onClick={() => navigate("/app/chat")} variant="primary" size="slim">
                Ask Claude
              </Button>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Divider />

        {/* Recent Customers */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text variant="headingMd" as="h2">Recent Customers</Text>
              <Button onClick={() => navigate("/app/customers")} variant="plain">View all</Button>
            </InlineStack>
            {recentCustomers.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "text", "numeric", "numeric", "text", "text"]}
                headings={["Customer", "Stage", "LTV Tier", "Orders", "Spend", "RTO Score", ""]}
                rows={rows}
              />
            ) : (
              <Box paddingBlock="800">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="p" tone="subdued">No customers yet.</Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Customers appear here when they place orders or start a checkout.
                  </Text>
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  )
}

function StatCard({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" tone="subdued" variant="bodySm">{title}</Text>
        <Text as="p" variant="headingLg" tone={highlight ? "caution" : undefined}>{value}</Text>
      </BlockStack>
    </Card>
  )
}

function stageTone(stage: string): "info" | "success" | "warning" | "critical" | undefined {
  const map: Record<string, "info" | "success" | "warning" | "critical"> = {
    prospect: "info",
    first_buyer: "info",
    repeat: "success",
    loyal: "success",
    vip: "success",
    at_risk: "warning",
    lapsed: "critical",
  }
  return map[stage]
}

function tierTone(tier: string): "info" | "success" | "warning" | undefined {
  const map: Record<string, "info" | "success" | "warning"> = {
    new: "info",
    growing: "info",
    loyal: "success",
    vip: "success",
    lapsed: "warning",
  }
  return map[tier]
}
