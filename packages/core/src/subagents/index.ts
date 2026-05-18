/**
 * Subagent Framework
 *
 * Unified background workflow system for continuous, domain-specific operations.
 *
 * Includes:
 * - BaseSubagent: Abstract base class with lifecycle management, retries, scheduling
 * - Types: Complete type definitions for all subagent operations
 * - Orchestrator: Manages registration, scheduling, and execution of all subagents
 * - 5 Subagent Types: MarketingOps, IntelligenceAnalysis, SystemOptimization,
 *   IntegrationSync, QAAudit (13 total instances with different schedules)
 *
 * Example:
 *   import {
 *     getOrchestrator,
 *     createMarketingOpsSubagents,
 *     createIntelligenceAnalysisSubagents,
 *     createSystemOptimizationSubagents,
 *     createIntegrationSyncSubagents,
 *     createQAAuditSubagents,
 *   } from '@d2c/core/subagents'
 *
 *   const orchestrator = getOrchestrator()
 *   orchestrator.register(createMarketingOpsSubagents())
 *   orchestrator.register(createIntelligenceAnalysisSubagents())
 *   orchestrator.register(createSystemOptimizationSubagents())
 *   orchestrator.register(createIntegrationSyncSubagents())
 *   orchestrator.register(createQAAuditSubagents())
 *   const results = await orchestrator.executeAllDueSubagents()
 */

export { BaseSubagent } from "./base"
export * from "./types"
export { SubagentOrchestrator, getOrchestrator, setOrchestrator } from "./orchestrator"
export { MarketingOpsSubagent, createMarketingOpsSubagents } from "./marketing-ops"
export {
  IntelligenceAnalysisSubagent,
  createIntelligenceAnalysisSubagents,
} from "./intelligence-analysis"
export {
  SystemOptimizationSubagent,
  createSystemOptimizationSubagents,
} from "./system-optimization"
export { IntegrationSyncSubagent, createIntegrationSyncSubagents } from "./integration-sync"
export { QAAuditSubagent, createQAAuditSubagents } from "./qa-audit"
