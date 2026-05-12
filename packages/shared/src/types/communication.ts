export type Channel = "whatsapp" | "email" | "sms"

export type TriggerType =
  | "abandoned_checkout"
  | "payment_failed"
  | "order_confirmation"
  | "order_packed"
  | "shipment_dispatched"
  | "shipment_out_for_delivery"
  | "shipment_delivered"
  | "shipment_stuck"
  | "shipment_failed_delivery"
  | "rto_prevention"
  | "post_delivery_checkin"
  | "review_request"
  | "upsell"
  | "repurchase_nudge"
  | "churn_intervention"
  | "win_back"
  | "support_resolution"

export interface MessagePayload {
  channel: Channel
  to: string           // phone or email
  templateName?: string
  body: string
  subject?: string     // email only
  variables?: Record<string, string>
  scheduledFor?: Date
}

export interface CommunicationResult {
  success: boolean
  messageId?: string
  error?: string
  channel: Channel
}
