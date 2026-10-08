/**
 * ARCHIVED PACKAGE: @agent-os/orchestrator
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Replaced by streamlined AgentLoop
 *
 * Revival condition: Multi-agent collaboration task passing >90% on distributed goals
 *
 * To revive: move this directory back to packages/orchestrator/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

export * from "./models";
export * from "./AgentContext";
export * from "./AgentResult";
export * from "./AgentCritique";
export * from "./AgentExecutionPlan";

export * from "./AgentRegistry";
export * from "./AgentRouter";
export * from "./AgentLifecycle";
export * from "./AgentConsensus";
export * from "./AgentConversation";
export * from "./AgentReplay";
export * from "./AgentCoordinator";

export * from "./AgentEvents";
export * from "./AgentMetrics";

// Agent implementations
export * from "./agents/BaseAgent";
export * from "./agents/ArchitectAgent";
export * from "./agents/CoderAgent";
export * from "./agents/ResearchAgent";
