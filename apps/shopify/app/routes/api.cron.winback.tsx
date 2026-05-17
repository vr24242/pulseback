import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "@d2c/database"
import { sendWhatsAppTemplate } from "@d2c/core"

// Runs every 30 min — executes due retention_actions
// POST /api/cron/winback  |  Header: X-Cron-Secret

const ACTION_TEMPLATES: Record<string, { templateName: string; buildParams: (name: string) => string[] }> = {
  win_back:           { templateName: "win_back_offer",      buildParams: (n) => [n, "COMEBACK15"] },
  churn_intervention: { templateName: "personal_outreach",   buildParams: (n) => [n] },
  review_request:     { templateName: "review_request",      buildParams: (n) => [n] },
  vip_reward:         { templateName: "vip_reward",          buildParams: (n) => [n, "VIP20"] },
  repurchase_nudge:   { templateName: "repurchase_nudge",    buildParams: (n) => [n] },
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = request.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const dueActions = await db.retentionAction.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lte: new Date() },
    },
    include: {
      customer: {
        select: {
          id: true, name: true, phone: true, ltvTier: true,
        },
      },
    },
    take: 100,
  })

  let sent = 0, skipped = 0, failed = 0

  for (const action of dueActions) {
    try {
      const customer = action.customer
      if (!customer.phone) {
        await db.retentionAction.update({
          where: { id: action.id },
          data: { status: "skipped" },
        })
        skipped++
        continue
      }

      const template = ACTION_TEMPLATES[action.actionType]
      if (!template) {
        await db.retentionAction.update({
          where: { id: action.id },
          data: { status: "skipped" },
        })
        skipped++
        continue
      }

      const shop = await db.shop.findUnique({
        where: { id: action.shopId },
        select: { aiSensyApiKey: true, watiApiToken: true, watiPhoneNumber: true, waPhoneNumberId: true, waAccessToken: true },
      })
      if (!shop) { skipped++; continue }

      const firstName = customer.name?.split(" ")[0] ?? "there"
      const bodyParams = template.buildParams(firstName)

      const result = await sendWhatsAppTemplate({
        phone: customer.phone,
        templateName: template.templateName,
        bodyParams,
        shopConfig: shop,
      })

      if (result.success) {
        const comm = await db.communication.create({
          data: {
            shopId: action.shopId,
            customerId: customer.id,
            channel: "whatsapp",
            direction: "outbound",
            messageId: result.messageId,
            templateName: template.templateName,
            body: `${action.actionType} sent`,
            triggerType: "retention.action",
            triggerRef: action.id,
            status: "sent",
            sentAt: new Date(),
          },
        })

        await db.retentionAction.update({
          where: { id: action.id },
          data: {
            status: "executed",
            executedAt: new Date(),
            communicationId: comm.id,
          },
        })
        sent++
      } else {
        await db.retentionAction.update({
          where: { id: action.id },
          data: { status: "failed" },
        })
        failed++
      }
    } catch (err) {
      console.error("[cron/winback]", action.id, err)
      await db.retentionAction.update({
        where: { id: action.id },
        data: { status: "failed" },
      }).catch(() => {})
      failed++
    }
  }

  return json({ processed: dueActions.length, sent, skipped, failed })
}

export const loader = async () => json({ ok: true, endpoint: "winback-cron" })
