/**
 * AGENT ORCHESTRATOR — Phase 5 Core
 *
 * This is the central intelligence system that coordinates all agents.
 * Instead of agents acting independently, they propose decisions to the orchestrator.
 * The orchestrator handles:
 * - Conflict resolution (two agents want to act on same customer)
 * - Priority enforcement (Support > Operations > Logistics > Finance > Marketing)
 * - Calendar coordination (no double messaging)
 * - Outcome tracking (decisions + outcomes feed back to agents)
 *
 * Every meaningful decision in PulseOS flows through this orchestrator.
 */

import { db } from "@d2c/database"
import type { CustomerMemory } from "../agents/customer-memory"
import { CalendarAgent } from "../agents/calendar"

// ──────────────────────────────────────────────────────────────────────────────
// DECISION TYPES
// ──────────────────────────────────────────────────────────────────────────────

export enum AgentDomain {
  Support = "support",
  Operations = "operations",
  Logistics = "logistics",
  Finance = "finance",
  Marketing = "marketing",
}

export enum DecisionAction {
  // Communication actions
  SendMessage = "send_message",
  SendApprovalRequest = "send_approval_request",
  HoldCommunication = "hold_communication",

  // Order/shipment actions
  BlockCOD = "block_cod",
  AllowCOD = "allow_cod",
  InitiateRTO = "initiate_rto",
  UpdateAddress = "update_address",
  SchedulePickup = "schedule_pickup",

  // Refund/payment actions
  ProcessRefund = "process_refund",
  ReleasePayment = "release_payment",

  // Operational actions
  EscalateToHuman = "escalate_to_human",
  UpdateCustomerSegment = "update_customer_segment",

  // System actions
  Skip = "skip",
  Wait = "wait",
  Queue = "queue",
}

/**
 * A decision proposed by an agent.
 * The orchestrator evaluates this and decides whether to execute it.
 */
export interface AgentProposal {
  // Identity
  agentDomain: AgentDomain
  agentName: string // e.g., "abandoned-cart", "ndr", "loyalty"

  // Target
  customerId: string
  orderId?: string
  shipmentId?: string

  // Decision
  action: DecisionAction
  reasoning: string // why the agent thinks this action is right
  context: Record<string, any> // additional context (discount %, delay time, etc.)

  // Confidence
  confidence: number // 0-100. How sure is the agent?
  priority: "low" | "medium" | "high" // How urgent is this?

  // Execution details
  retryable: boolean // Can this be retried if it fails?
  idempotencyKey: string // Unique key to prevent duplicate execution
}

/**
 * The orchestrator's decision to approve or reject an agent proposal.
 */
export interface OrchestratorDecision {
  // Outcome
  approved: boolean
  reason: string // Why approved or rejected

  // If approved, execution details
  executeImmediately?: boolean
  executeAt?: Date // Queue for later execution
  priority: number // Execution priority (0-100)

  // Metadata
  conflicts?: ConflictResolution[] // Any conflicts resolved
  overrides?: Override[] // Any rules applied
}

/**
 * When two agents want to do something about the same customer
 */
export interface ConflictResolution {
  winnerDomain: AgentDomain // Who wins
  loserDomain: AgentDomain // Who loses
  reason: string
  loserRescheduleAt?: Date // When does the loser get to retry?
}

/**
 * When an agent's decision conflicts with a rule
 */
export interface Override {
  rule: string
  reason: string
  effect: "approved" | "deferred" | "rejected"
}

/**
 * Outcome of an executed decision (for learning loop)
 */
export interface DecisionOutcome {
  proposalId: string
  outcome: "executed" | "deferred" | "rejected"
  result?: Record<string, any>
  error?: string
  executedAt?: Date
}

// ──────────────────────────────────────────────────────────────────────────────
// CONFLICT RESOLUTION ENGINE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Priority ordering: higher index = higher priority
 */
const DOMAIN_PRIORITY: Record<AgentDomain, number> = {
  [AgentDomain.Support]: 5,
  [AgentDomain.Operations]: 4,
  [AgentDomain.Logistics]: 3,
  [AgentDomain.Finance]: 2,
  [AgentDomain.Marketing]: 1,
}

/**
 * Resolve conflicts when multiple agents want to act on the same customer
 */
async function resolveConflict(
  proposals: AgentProposal[],
  customerMemory: CustomerMemory
): Promise<ConflictResolution[]> {
  if (proposals.length <= 1) return []

  const resolved: ConflictResolution[] = []

  // Sort by priority (higher wins)
  const sorted = [...proposals].sort(
    (a, b) => DOMAIN_PRIORITY[b.agentDomain] - DOMAIN_PRIORITY[a.agentDomain]
  )

  // Winner is the highest priority agent
  const winner = sorted[0]

  // Losers are rescheduled 48h from now
  for (let i = 1; i < sorted.length; i++) {
    const loser = sorted[i]
    resolved.push({
      winnerDomain: winner.agentDomain,
      loserDomain: loser.agentDomain,
      reason: `${winner.agentDomain} has higher priority than ${loser.agentDomain}`,
      loserRescheduleAt: new Date(Date.now() + 48 * 3600 * 1000),
    })
  }

  return resolved
}

// ──────────────────────────────────────────────────────────────────────────────
// RULE ENGINE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Apply universal rules that apply to all agents
 */
function applyUniversalRules(
  proposal: AgentProposal,
  customerMemory: CustomerMemory
): Override[] {
  const overrides: Override[] = []

  // Rule 1: Never spam customers who have ignored 3+ comms
  if (
    customerMemory.hasIgnoredLast3Comms &&
    proposal.action === DecisionAction.SendMessage
  ) {
    overrides.push({
      rule: "NO_SPAM_AFTER_IGNORED_3",
      reason: "Customer has ignored 3+ messages. Silence is the right call.",
      effect: "rejected",
    })
  }

  // Rule 2: VIP customers → escalate to human, don't automate
  if (customerMemory.ltvTier === "vip" && proposal.action === DecisionAction.BlockCOD) {
    overrides.push({
      rule: "VIP_MANUAL_OVERRIDE",
      reason: "VIP customers require human review for exceptions.",
      effect: "deferred",
    })
  }

  // Rule 3: Never send comms between 22:00-08:00 IST
  if (proposal.action === DecisionAction.SendMessage) {
    const now = new Date()
    const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
    const hour = istTime.getHours()

    if (hour >= 22 || hour < 8) {
      overrides.push({
        rule: "QUIET_HOURS",
        reason: "Communication scheduled during quiet hours (22:00-08:00 IST)",
        effect: "deferred",
      })
    }
  }

  // Rule 4: Hold all marketing when customer has pending issues
  if (
    proposal.agentDomain === AgentDomain.Marketing &&
    (customerMemory.hasPendingRefund ||
      customerMemory.hasPendingReturn ||
      customerMemory.hasOpenNDR)
  ) {
    const reasons: string[] = []
    if (customerMemory.hasPendingRefund) reasons.push("pending refund")
    if (customerMemory.hasPendingReturn) reasons.push("pending return")
    if (customerMemory.hasOpenNDR) reasons.push("open NDR")

    overrides.push({
      rule: "HOLD_ON_OPEN_ISSUES",
      reason: `Customer has ${reasons.join(", ")}. Hold marketing until resolved.`,
      effect: "deferred",
    })
  }

  return overrides
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ──────────────────────────────────────────────────────────────────────────────

export class AgentOrchestrator {
  /**
   * Main entry point: agents call this to propose a decision
   */
  static async propose(
    proposal: AgentProposal,
    customerMemory: CustomerMemory
  ): Promise<OrchestratorDecision> {
    // Step 1: Apply universal rules
    const ruleOverrides = applyUniversalRules(proposal, customerMemory)

    // Check if any rule rejects this outright
    const rejection = ruleOverrides.find((o) => o.effect === "rejected")
    if (rejection) {
      return {
        approved: false,
        reason: rejection.reason,
        priority: 0,
        overrides: ruleOverrides,
      }
    }

    // Step 2: Check Calendar Agent for conflicts
    let canSend = true
    let holdReason = ""

    if ([DecisionAction.SendMessage, DecisionAction.SendApprovalRequest].includes(
      proposal.action
    )) {
      // Only check calendar for communication actions
      const calendarResult = await CalendarAgent.canSend(
        proposal.customerId,
        proposal.agentDomain
      )

      if (!calendarResult.allowed) {
        canSend = false
        holdReason = calendarResult.reason
      }
    }

    // Step 3: Check for duplicate decisions (within last hour)
    const recentDecision = await db.agentDecision.findFirst({
      where: {
        customerId: proposal.customerId,
        agentDomain: proposal.agentDomain,
        action: proposal.action,
        createdAt: {
          gte: new Date(Date.now() - 3600 * 1000), // last hour
        },
      },
    })

    if (recentDecision && !proposal.idempotencyKey.includes("force")) {
      return {
        approved: false,
        reason: "Duplicate decision detected in last hour",
        priority: 0,
        overrides: ruleOverrides,
      }
    }

    // Step 4: Determine execution timing
    const executeImmediately = !ruleOverrides.some((o) => o.effect === "deferred") && canSend
    const executeAt = !executeImmediately ? new Date(Date.now() + 5 * 60 * 1000) : undefined // 5 min default

    return {
      approved: true,
      reason: executeImmediately ? "Approved for immediate execution" : holdReason,
      executeImmediately,
      executeAt: !executeImmediately ? executeAt : undefined,
      priority: proposal.priority === "high" ? 100 : proposal.priority === "medium" ? 50 : 10,
      overrides: ruleOverrides,
    }
  }

  /**
   * Execute an approved decision
   */
  static async execute(
    proposal: AgentProposal,
    decision: OrchestratorDecision
  ): Promise<DecisionOutcome> {
    if (!decision.approved) {
      return {
        proposalId: proposal.idempotencyKey,
        outcome: "rejected",
        error: decision.reason,
      }
    }

    try {
      // Step 1: Store decision for audit trail
      await db.agentDecision.create({
        data: {
          customerId: proposal.customerId,
          agentDomain: proposal.agentDomain,
          agentName: proposal.agentName,
          action: proposal.action,
          reasoning: proposal.reasoning,
          context: proposal.context,
          confidence: proposal.confidence,
          priority: proposal.priority,
          idempotencyKey: proposal.idempotencyKey,
          orchestratorReason: decision.reason,
          overrides: JSON.stringify(decision.overrides || []),
          conflicts: JSON.stringify(decision.conflicts || []),
          status: decision.executeImmediately ? "executing" : "queued",
          queuedAt: !decision.executeImmediately ? new Date() : undefined,
          executeAt: decision.executeAt,
        },
      })

      // Step 2: Queue or execute based on decision
      if (!decision.executeImmediately) {
        return {
          proposalId: proposal.idempotencyKey,
          outcome: "deferred",
          executedAt: decision.executeAt,
        }
      }

      // Step 3: Execute the action (actual implementation depends on action type)
      // This is where the decision translates to actual operations
      const result = await executeAction(proposal)

      // Step 4: Mark as executed
      await db.agentDecision.update({
        where: { idempotencyKey: proposal.idempotencyKey },
        data: {
          status: "executed",
          result: JSON.stringify(result),
          executedAt: new Date(),
        },
      })

      return {
        proposalId: proposal.idempotencyKey,
        outcome: "executed",
        result,
        executedAt: new Date(),
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      await db.agentDecision.update({
        where: { idempotencyKey: proposal.idempotencyKey },
        data: {
          status: "failed",
          error: errorMsg,
        },
      })

      return {
        proposalId: proposal.idempotencyKey,
        outcome: "executed",
        error: errorMsg,
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ACTION EXECUTOR (stub — implemented per action type)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Translate a decision into actual operations
 * This is where the intelligence becomes action
 */
async function executeAction(proposal: AgentProposal): Promise<Record<string, any>> {
  switch (proposal.action) {
    case DecisionAction.SendMessage:
      return {
        type: "message_queued",
        customerId: proposal.customerId,
        channel: proposal.context.channel || "whatsapp",
      }

    case DecisionAction.BlockCOD:
      return {
        type: "cod_blocked",
        customerId: proposal.customerId,
        reason: proposal.reasoning,
      }

    case DecisionAction.AllowCOD:
      return {
        type: "cod_allowed",
        customerId: proposal.customerId,
      }

    case DecisionAction.InitiateRTO:
      return {
        type: "rto_initiated",
        shipmentId: proposal.shipmentId,
        customerId: proposal.customerId,
      }

    case DecisionAction.EscalateToHuman:
      return {
        type: "escalated",
        escalationType: proposal.context.escalationType || "general",
        customerId: proposal.customerId,
      }

    case DecisionAction.Skip:
    case DecisionAction.Wait:
      return {
        type: "no_action",
        reason: proposal.reasoning,
      }

    default:
      return {
        type: "unknown_action",
        action: proposal.action,
      }
  }
}

export default AgentOrchestrator
