/**
 * ARCHIVED PACKAGE: @agent-os/execution-engine
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Replaced by AgentLoop
 *
 * Revival condition: Multi-step task eval where plan graph yields higher pass-rate than AgentLoop
 *
 * To revive: move this directory back to packages/execution-engine/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

export * from "./models";
export * from "./ExecutionContext";
export * from "./ExecutionState";
export * from "./ExecutionEngine";
export * from "./PlanExecutor";
export * from "./TaskScheduler";
export * from "./TaskDispatcher";
export * from "./TaskLifecycleManager";
export * from "./FailureAnalyzer";
export * from "./RetryManager";
export * from "./ExecutionReplay";
export * from "./ValidationCoordinator";
export * from "./ApprovalCoordinator";
export * from "./TaskResultAggregator";
export * from "./ExecutionEvents";
export * from "./ExecutionMetrics";
