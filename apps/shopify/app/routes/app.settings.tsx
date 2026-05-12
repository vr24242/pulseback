import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react"
import {
  Page, Layout, Card, FormLayout, TextField, Button, Banner,
  Text, BlockStack, Divider, Badge, InlineStack,
} from "@shopify/polaris"
import { authenticate } from "../shopify.server"
import { db } from "@d2c/database"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    select: {
      waPhoneNumberId: true,
      waBusinessAccountId: true,
      waVerifyToken: true,
      codEnabled: true,
      rtoThreshold: true,
      dispatchSlaHours: true,
    },
  })
  return json({ shop })
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const formData = await request.formData()

  const waPhoneNumberId     = formData.get("waPhoneNumberId") as string
  const waAccessToken       = formData.get("waAccessToken") as string
  const waBusinessAccountId = formData.get("waBusinessAccountId") as string
  const waVerifyToken       = formData.get("waVerifyToken") as string
  const rtoThreshold        = parseInt(formData.get("rtoThreshold") as string) || 60
  const dispatchSlaHours    = parseInt(formData.get("dispatchSlaHours") as string) || 24
  const codEnabled          = formData.get("codEnabled") === "true"

  await db.shop.update({
    where: { domain: session.shop },
    data: {
      waPhoneNumberId:     waPhoneNumberId     || undefined,
      waAccessToken:       waAccessToken       || undefined,
      waBusinessAccountId: waBusinessAccountId || undefined,
      waVerifyToken:       waVerifyToken       || undefined,
      rtoThreshold,
      dispatchSlaHours,
      codEnabled,
    },
  })

  return json({ success: true })
}

export default function Settings() {
  const { shop } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const nav = useNavigation()
  const saving = nav.state === "submitting"

  const webhookUrl = "https://pulseback.fly.dev/api/whatsapp/webhook"
  const cronUrl    = "https://pulseback.fly.dev/api/cron/abandoned"

  return (
    <Page title="Settings" subtitle="Configure Pulseback integrations and automation rules">
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved successfully." />
          </Layout.Section>
        )}

        {/* WhatsApp Cloud API */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">WhatsApp Business (Meta Cloud API)</Text>
                <Badge tone={shop?.waPhoneNumberId ? "success" : "warning"}>
                  {shop?.waPhoneNumberId ? "Connected" : "Not configured"}
                </Badge>
              </InlineStack>
              <Text variant="bodySm" tone="subdued" as="p">
                Connect your Meta WhatsApp Business account to send COD confirmations,
                abandoned cart recovery, and order updates.
              </Text>
              <Divider />
              <Form method="post">
                <BlockStack gap="400">
                  <FormLayout>
                    <TextField
                      label="Phone Number ID"
                      name="waPhoneNumberId"
                      defaultValue={shop?.waPhoneNumberId ?? ""}
                      placeholder="1234567890123"
                      helpText="Found in Meta Business Suite → WhatsApp → API Setup"
                      autoComplete="off"
                    />
                    <TextField
                      label="Permanent Access Token"
                      name="waAccessToken"
                      type="password"
                      defaultValue=""
                      placeholder="EAAxxxxx..."
                      helpText="Generate from Meta Business Suite → System Users → Generate Token"
                      autoComplete="off"
                    />
                    <TextField
                      label="WhatsApp Business Account ID"
                      name="waBusinessAccountId"
                      defaultValue={shop?.waBusinessAccountId ?? ""}
                      placeholder="1234567890123"
                      helpText="Found in Meta Business Suite → Settings → Business Info"
                      autoComplete="off"
                    />
                    <TextField
                      label="Webhook Verify Token"
                      name="waVerifyToken"
                      defaultValue={shop?.waVerifyToken ?? "pulseback_verify"}
                      helpText="Set this as the verify token in Meta App → Webhooks"
                      autoComplete="off"
                    />
                  </FormLayout>

                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">Webhook Configuration</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      In Meta for Developers → Your App → WhatsApp → Configuration, set:
                    </Text>
                    <Text variant="bodySm" as="p">
                      <strong>Callback URL:</strong> {webhookUrl}
                    </Text>
                    <Text variant="bodySm" as="p">
                      <strong>Subscribe to:</strong> messages, message_deliveries, message_reads
                    </Text>
                  </BlockStack>

                  {/* Order Settings */}
                  <Divider />
                  <Text variant="headingMd" as="h2">Order Rules</Text>
                  <FormLayout>
                    <TextField
                      label="RTO Risk Threshold (hide COD above this score)"
                      name="rtoThreshold"
                      type="number"
                      defaultValue={String(shop?.rtoThreshold ?? 60)}
                      min="0"
                      max="100"
                      suffix="/ 100"
                      helpText="Customers scoring above this will not see Cash on Delivery at checkout"
                      autoComplete="off"
                    />
                    <TextField
                      label="Dispatch SLA (hours)"
                      name="dispatchSlaHours"
                      type="number"
                      defaultValue={String(shop?.dispatchSlaHours ?? 24)}
                      suffix="hours"
                      helpText="How many hours you have to dispatch an order before it's flagged as delayed"
                      autoComplete="off"
                    />
                  </FormLayout>

                  {/* Abandoned Cart */}
                  <Divider />
                  <Text variant="headingMd" as="h2">Abandoned Cart Automation</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Automatically sends WhatsApp recovery messages 30 minutes after cart abandonment.
                    Set up a cron job to call the endpoint below every 5 minutes.
                  </Text>
                  <Text variant="bodySm" as="p">
                    <strong>Cron URL:</strong> {cronUrl}
                  </Text>
                  <Text variant="bodySm" as="p">
                    <strong>Header:</strong> X-Cron-Secret: [your CRON_SECRET env var]
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Tip: Use cron-job.org (free) or Fly.io scheduled machines to call this URL.
                  </Text>

                  <Button submit loading={saving} variant="primary">Save Settings</Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
