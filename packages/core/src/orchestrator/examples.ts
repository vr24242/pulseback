/**
 * ORCHESTRATOR INTEGRATION EXAMPLES
 *
 * Shows how to wire existing agents into the orchestrator.
 * Use these patterns when converting workers to use the orchestrator.
 */

import { AgentOrchestrator, AgentProposal, AgentDomain, DecisionAction } from "./index"
import { getCustomerMemory } from "../agents/customer-memory"

// ──────────────────────────────────────────────────────────────────────────────
// EXAMPLE 1: Abandoned Cart Decision Flow
// ──────────────────────────────────────────────────────────────────────────────

/**
 * OLD PATTERN (without orchestrator):
 *
 * async function processAbandonedCart(checkoutId) {
 *   const customerMemory = await getCustomerMemory(...)
 *   const decision = await cartDecisionAgent.decide(customerMemory)
 *   if (decision.action === "send") {
 *     await communicationAgent.sendMessage(...)
 *   }
 * }
 *
 * Problem: Decisions execute immediately. No conflict resolution.
 * If two workers want to message the same customer, they both send.
 */

/**
 * NEW PATTERN (with orchestrator):
 *
 * The agent proposes a decision. Orchestrator approves/rejects.
 * If approved, worker executes. If rejected, worker reschedules.
 */

export async function processAbandonedCartWithOrchestrator(
  customerId: string,
  checkoutId: string
) {
  // Step 1: Load customer context
  const customerMemory = await getCustomerMemory(customerId)
  if (!customerMemory) {
    console.log("Customer not found")
    return
  }

  // Step 2: Agent makes a decision (existing agent logic)
  // This could be your existing cartDecisionAgent.decide() call
  const agentDecision = {
    shouldSend: true,
    touchNumber: 1,
    offerDiscount: false,
    message: "You left something in your cart...",
  }

  // Step 3: Convert to orchestrator proposal
  const proposal: AgentProposal = {
    agentDomain: AgentDomain.Marketing,
    agentName: "abandoned-cart",
    customerId,
    action: DecisionAction.SendMessage,
    reasoning: `Touch 1 abandoned cart recovery. Customer opened email ${customerMemory.totalOrders} times before, high engagement.`,
    context: {
      checkoutId,
      touchNumber: agentDecision.touchNumber,
      messageTemplate: agentDecision.message,
      channel: "whatsapp",
    },
    confidence: 78, // agent is 78% sure
    priority: "medium",
    retryable: true,
    idempotencyKey: `cart-${customerId}-${checkoutId}-touch1`,
  }

  // Step 4: Propose to orchestrator
  const orchestratorDecision = await AgentOrchestrator.propose(proposal, customerMemory)

  if (!orchestratorDecision.approved) {
    // Decision was rejected by orchestrator rules
    console.log(`Decision rejected: ${orchestratorDecision.reason}`)

    // If it was deferred (not rejected), reschedule
    if (orchestratorDecision.executeAt) {
      // Reschedule job for later
      await queueJob("abandoned-cart", { customerId, checkoutId }, {
        delay: orchestratorDecision.executeAt.getTime() - Date.now(),
      })
    }
    return
  }

  // Step 5: Execute the approved decision
  const outcome = await AgentOrchestrator.execute(proposal, orchestratorDecision)

  console.log(`Decision executed:`, outcome)

  // Step 6: If executing immediately, wait for result
  if (orchestratorDecision.executeImmediately) {
    // Now actually send the message
    await sendWhatsAppMessage({
      customerId,
      message: agentDecision.message,
      decisionId: outcome.proposalId,
    })

    // Record outcome
    const { recordOutcome } = await import("../learning/feedback-loop")
    await recordOutcome(outcome.proposalId, "success", {
      sentAt: new Date(),
    })
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// EXAMPLE 2: NDR (Non-Delivery Report) Resolution with Orchestrator
// ──────────────────────────────────────────────────────────────────────────────

export async function processNDRWithOrchestrator(shipmentId: string) {
  const shipment = await getShipment(shipmentId)
  const customerMemory = await getCustomerMemory(shipment.customerId)

  // Agent decides what to do with this stuck shipment
  const agentDecision = {
    action: "send_wa",
    message: "We're trying to deliver your order. Can you confirm your address?",
    escalate: false,
  }

  // Convert to proposal
  const proposal: AgentProposal = {
    agentDomain: AgentDomain.Logistics,
    agentName: "ndr",
    customerId: shipment.customerId,
    shipmentId,
    action: DecisionAction.SendMessage,
    reasoning: `Shipment stuck 2 days. Customer has 3+ orders. Responsive (reply rate 70%). Send address confirmation.`,
    context: {
      shipmentId,
      failedAttempts: shipment.failedAttempts,
      lastAttemptAt: shipment.lastAttemptAt,
    },
    confidence: 82,
    priority: "high", // logistics has high priority
    retryable: true,
    idempotencyKey: `ndr-${shipmentId}-attempt${shipment.failedAttempts + 1}`,
  }

  const orchestratorDecision = await AgentOrchestrator.propose(proposal, customerMemory)

  if (!orchestratorDecision.approved) {
    console.log(`NDR decision rejected: ${orchestratorDecision.reason}`)
    return
  }

  // Execute
  const outcome = await AgentOrchestrator.execute(proposal, orchestratorDecision)

  if (orchestratorDecision.executeImmediately) {
    // Send WA message about stuck shipment
    await sendWhatsAppMessage({
      customerId: shipment.customerId,
      message: agentDecision.message,
      decisionId: outcome.proposalId,
    })

    // Record outcome
    const { recordOutcome } = await import("../learning/feedback-loop")
    await recordOutcome(outcome.proposalId, "success")
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// EXAMPLE 3: Conflict Resolution in Action
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Imagine these two scenarios happen simultaneously for the same customer:
 * 1. Marketing agent wants to send a winback offer
 * 2. Logistics agent wants to send an NDR message
 *
 * Both want to message the customer TODAY.
 * Orchestrator applies the priority rule: Logistics > Marketing.
 * Marketing's message is deferred 48h.
 */

export async function handleConflictExample(customerId: string) {
  const customerMemory = await getCustomerMemory(customerId)

  // Proposal 1: Marketing wants to send winback
  const marketingProposal: AgentProposal = {
    agentDomain: AgentDomain.Marketing,
    agentName: "winback",
    customerId,
    action: DecisionAction.SendMessage,
    reasoning: "Customer churned 60 days ago. VIP tier. Time to win back.",
    context: { offerPercent: 15 },
    confidence: 65,
    priority: "medium",
    retryable: true,
    idempotencyKey: `winback-${customerId}-july`,
  }

  // Proposal 2: Logistics wants to send NDR
  const logisticsProposal: AgentProposal = {
    agentDomain: AgentDomain.Logistics,
    agentName: "ndr",
    customerId,
    action: DecisionAction.SendMessage,
    reasoning: "Shipment stuck 2 days. Critical.",
    context: { shipmentId: "ship_123" },
    confidence: 90,
    priority: "high",
    retryable: true,
    idempotencyKey: `ndr-${customerId}-july`,
  }

  // Orchestrate both
  const marketingOrchestratorDecision = await AgentOrchestrator.propose(
    marketingProposal,
    customerMemory
  )
  const logisticsOrchestratorDecision = await AgentOrchestrator.propose(
    logisticsProposal,
    customerMemory
  )

  console.log("Marketing decision:", marketingOrchestratorDecision)
  // Result: { approved: true, executeImmediately: false, executeAt: Date(now + 48h), ... }
  // Reason: "Marketing deferred 48h. Logistics takes priority (higher domain priority)."

  console.log("Logistics decision:", logisticsOrchestratorDecision)
  // Result: { approved: true, executeImmediately: true, ... }
  // Reason: "Approved. Logistics has high priority, no conflicts."
}

// ──────────────────────────────────────────────────────────────────────────────
// STUBS — Replace with actual implementations
// ──────────────────────────────────────────────────────────────────────────────

async function getShipment(shipmentId: string) {
  // TODO: implement
  return {}
}

async function sendWhatsAppMessage(params: any) {
  // TODO: implement
}

async function queueJob(name: string, data: any, options: any) {
  // TODO: implement
}
