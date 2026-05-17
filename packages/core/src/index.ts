// Identity OS
export * from "./identity/resolver"
export * from "./identity/scorer"

// Checkout OS
export * from "./checkout/intelligence"

// Communication OS
export * from "./communication/router"
export * from "./communication/whatsapp"

// Order OS
export * from "./order/lifecycle"

// Shipping OS
export * from "./shipping/tracker"

// Retention OS
export * from "./retention/churn"

// Marketing OS
export * from "./marketing/capi"

// Agents
export * from "./agents/orchestrator"
export * from "./agents/support-agent"

// Event Bus
export * from "./events/bus"

// Handlers (self-registering — import to activate)
export * from "./handlers/communication"
