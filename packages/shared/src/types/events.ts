// All events that flow through the event bus between Sub-OSes

export type EventType =
  // Checkout OS
  | "checkout.started"
  | "checkout.identity_captured"
  | "checkout.abandoned"
  | "checkout.completed"
  | "checkout.payment_failed"
  // Order OS
  | "order.placed"
  | "order.confirmed"
  | "order.packed"
  | "order.cancelled"
  | "order.upsell_shown"
  | "order.upsell_converted"
  // Shipping OS
  | "shipment.created"
  | "shipment.in_transit"
  | "shipment.out_for_delivery"
  | "shipment.delivered"
  | "shipment.failed_delivery"
  | "shipment.stuck"
  | "shipment.rto_initiated"
  // Support OS
  | "support.ticket_opened"
  | "support.ticket_resolved"
  | "support.escalated"
  // Retention OS
  | "retention.churn_risk_detected"
  | "retention.win_back_triggered"
  | "retention.vip_identified"
  // Communication OS
  | "communication.sent"
  | "communication.delivered"
  | "communication.opened"
  | "communication.replied"
  // Marketing OS
  | "marketing.capi_fired"

export interface BaseEvent {
  eventType: EventType
  shopId: string
  customerId?: string
  timestamp: Date
  metadata: Record<string, unknown>
}

export interface CheckoutStartedEvent extends BaseEvent {
  eventType: "checkout.started"
  metadata: {
    sessionToken: string
    cartValue: number
    cartItems: Array<{ productId: string; quantity: number; price: number }>
    utmSource?: string
    utmCampaign?: string
    deviceType?: string
  }
}

export interface IdentityCapturedEvent extends BaseEvent {
  eventType: "checkout.identity_captured"
  metadata: {
    sessionToken: string
    phone?: string
    email?: string
    pincode?: string
    isReturningCustomer: boolean
    rtoRiskScore: number
  }
}

export interface CheckoutAbandonedEvent extends BaseEvent {
  eventType: "checkout.abandoned"
  metadata: {
    sessionToken: string
    phone?: string
    email?: string
    cartValue: number
    cartItems: Array<{ productId: string; name: string; price: number }>
    abandonedAt: Date
  }
}

export interface OrderPlacedEvent extends BaseEvent {
  eventType: "order.placed"
  metadata: {
    orderId: string
    shopifyOrderId: string
    shopifyOrderName: string
    totalPrice: number
    paymentMethod: "cod" | "prepaid"
    items: Array<{ productId: string; name: string; quantity: number; price: number }>
    rtoRisk: number
  }
}

export interface ShipmentDeliveredEvent extends BaseEvent {
  eventType: "shipment.delivered"
  metadata: {
    shipmentId: string
    orderId: string
    awb: string
    carrier: string
    deliveredAt: Date
  }
}

export interface ChurnRiskDetectedEvent extends BaseEvent {
  eventType: "retention.churn_risk_detected"
  metadata: {
    churnScore: number
    daysSinceLastOrder: number
    ltvTier: string
    suggestedAction: "soft_engagement" | "personal_outreach" | "win_back_offer"
  }
}

export type AppEvent =
  | CheckoutStartedEvent
  | IdentityCapturedEvent
  | CheckoutAbandonedEvent
  | OrderPlacedEvent
  | ShipmentDeliveredEvent
  | ChurnRiskDetectedEvent
  | BaseEvent
