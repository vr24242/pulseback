import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react"
import {
  Page, Layout, Card, FormLayout, TextField, Button, Banner,
  Text, BlockStack, Divider, Badge, InlineStack, Box,
} from "@shopify/polaris"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    select: {
      aiSensyApiKey: true,
      watiApiToken: true,
      watiPhoneNumber: true,
      waPhoneNumberId: true,
      waBusinessAccountId: true,
      waVerifyToken: true,
      codEnabled: true,
      rtoThreshold: true,
      dispatchSlaHours: true,
    },
  })
  return json({ shop, domain: session.shop })
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const formData = await request.formData()

  await db.shop.update({
    where: { domain: session.shop },
    data: {
      aiSensyApiKey:       (formData.get("aiSensyApiKey") as string)       || undefined,
      watiApiToken:        (formData.get("watiApiToken") as string)         || undefined,
      watiPhoneNumber:     (formData.get("watiPhoneNumber") as string)      || undefined,
      waPhoneNumberId:     (formData.get("waPhoneNumberId") as string)      || undefined,
      waAccessToken:       (formData.get("waAccessToken") as string)        || undefined,
      waBusinessAccountId: (formData.get("waBusinessAccountId") as string)  || undefined,
      waVerifyToken:       (formData.get("waVerifyToken") as string)        || undefined,
      rtoThreshold:     parseInt(formData.get("rtoThreshold") as string)     || 60,
      dispatchSlaHours: parseInt(formData.get("dispatchSlaHours") as string) || 24,
    },
  })

  return json({ success: true })
}

export default function Settings() {
  const { shop } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const nav = useNavigation()
  const saving = nav.state === "submitting"

  const waWebhookUrl = "https://pulseback.fly.dev/api/whatsapp/webhook"
  const cronUrl = "https://pulseback.fly.dev/api/cron/abandoned"

  const hasAiSensy = !!shop?.aiSensyApiKey
  const hasWATI    = !!shop?.watiApiToken
  const hasMeta    = !!shop?.waPhoneNumberId

  const activeProvider = hasAiSensy ? "AiSensy" : hasWATI ? "WATI" : hasMeta ? "Meta Cloud API" : null

  return (
    <Page title="Settings" subtitle="Configure WhatsApp, automation rules, and integrations">
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved." />
          </Layout.Section>
        )}

        <Layout.Section>
          <Form method="post">
            <BlockStack gap="500">

              {/* WhatsApp Provider */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">WhatsApp Integration</Text>
                    <Badge tone={activeProvider ? "success" : "warning"}>
                      {activeProvider ? `Active: ${activeProvider}` : "Not configured"}
                    </Badge>
                  </InlineStack>

                  <Text variant="bodySm" tone="subdued" as="p">
                    Configure one provider. Priority: AiSensy → WATI → Meta Cloud API.
                    For Indian D2C, AiSensy is recommended — live in 2-4 hours, no Meta business verification needed.
                  </Text>

                  <Divider />

                  {/* AiSensy — recommended */}
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Text variant="headingSm" as="h3">Option 1: AiSensy</Text>
                      <Badge tone="success">Recommended for India</Badge>
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Sign up at aisensy.com → API Keys → copy your API key.
                      WhatsApp number activation takes 2-4 hours.
                    </Text>
                    <FormLayout>
                      <TextField
                        label="AiSensy API Key"
                        name="aiSensyApiKey"
                        defaultValue={shop?.aiSensyApiKey ?? ""}
                        placeholder="your-aisensy-api-key"
                        type="password"
                        autoComplete="off"
                        helpText="From AiSensy Dashboard → Settings → API Keys"
                      />
                    </FormLayout>
                  </BlockStack>

                  <Divider />

                  {/* WATI */}
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">Option 2: WATI</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Sign up at wati.io → Settings → API → copy API URL and token.
                    </Text>
                    <FormLayout>
                      <TextField
                        label="WATI API URL"
                        name="watiPhoneNumber"
                        defaultValue={shop?.watiPhoneNumber ?? ""}
                        placeholder="https://live-server-12345.wati.io"
                        autoComplete="off"
                        helpText="Your WATI server URL (found in API docs)"
                      />
                      <TextField
                        label="WATI API Token"
                        name="watiApiToken"
                        defaultValue={shop?.watiApiToken ?? ""}
                        type="password"
                        placeholder="eyJhbGciOi..."
                        autoComplete="off"
                      />
                    </FormLayout>
                  </BlockStack>

                  <Divider />

                  {/* Meta Cloud API */}
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Text variant="headingSm" as="h3">Option 3: Meta WhatsApp Cloud API</Text>
                      <Badge tone="warning">Requires business verification (1-7 days)</Badge>
                    </InlineStack>
                    <FormLayout>
                      <TextField
                        label="Phone Number ID"
                        name="waPhoneNumberId"
                        defaultValue={shop?.waPhoneNumberId ?? ""}
                        placeholder="1234567890123"
                        autoComplete="off"
                      />
                      <TextField
                        label="Permanent Access Token"
                        name="waAccessToken"
                        type="password"
                        defaultValue=""
                        placeholder="EAAxxxxx..."
                        autoComplete="off"
                      />
                      <TextField
                        label="Business Account ID"
                        name="waBusinessAccountId"
                        defaultValue={shop?.waBusinessAccountId ?? ""}
                        placeholder="1234567890123"
                        autoComplete="off"
                      />
                      <TextField
                        label="Webhook Verify Token"
                        name="waVerifyToken"
                        defaultValue={shop?.waVerifyToken ?? "pulseback_verify"}
                        autoComplete="off"
                        helpText={`Set this in Meta App → Webhooks → Callback URL: ${waWebhookUrl}`}
                      />
                    </FormLayout>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Required WhatsApp Templates */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Required Message Templates</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Create these templates in your WhatsApp provider dashboard before automations will work.
                  </Text>
                  {[
                    { name: "order_confirmed",        params: "{{name}}, {{order_id}}, {{amount}}",                     use: "Sent on every prepaid order" },
                    { name: "cod_confirmation",        params: "{{name}}, {{order_id}}, {{amount}}",                     use: "Sent on COD — customer replies YES/NO" },
                    { name: "abandoned_cart_recovery", params: "{{name}}, {{cart_value}}, {{discount_code}}",            use: "Sent 30 min after cart abandonment" },
                    { name: "order_dispatched",        params: "{{name}}, {{order_id}}, {{awb}}, {{carrier}}",           use: "Sent when shipment dispatched" },
                  ].map(t => (
                    <Box key={t.name} padding="300" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="100">
                        <Text variant="bodySm" fontWeight="bold" as="p">{t.name}</Text>
                        <Text variant="bodySm" tone="subdued" as="p">Params: {t.params}</Text>
                        <Text variant="bodySm" tone="subdued" as="p">Use: {t.use}</Text>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>

              {/* Abandoned Cart Cron */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Abandoned Cart Cron</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Set up a cron job to call this URL every 5 minutes. Use cron-job.org (free).
                  </Text>
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="bold" as="p">POST {cronUrl}</Text>
                      <Text variant="bodySm" tone="subdued" as="p">Header: X-Cron-Secret: [your CRON_SECRET]</Text>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>

              {/* Order Rules */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Order Rules</Text>
                  <FormLayout>
                    <TextField
                      label="RTO Score Threshold — hide COD above this score"
                      name="rtoThreshold"
                      type="number"
                      defaultValue={String(shop?.rtoThreshold ?? 60)}
                      suffix="/ 100"
                      helpText="Customers scoring above this will not see Cash on Delivery at checkout"
                      autoComplete="off"
                    />
                    <TextField
                      label="Dispatch SLA"
                      name="dispatchSlaHours"
                      type="number"
                      defaultValue={String(shop?.dispatchSlaHours ?? 24)}
                      suffix="hours"
                      helpText="Hours you have to dispatch before the order is flagged as delayed"
                      autoComplete="off"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <Button submit loading={saving} variant="primary" size="large">
                Save Settings
              </Button>

            </BlockStack>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
