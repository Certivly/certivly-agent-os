/**
 * ARCHIVED PACKAGE: @agent-os/subagents
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Replaced by lightweight SearchSubagent
 *
 * Revival condition: Distributed workload benchmark exceeding single-loop throughput
 *
 * To revive: move this directory back to packages/subagents/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

// Models
export * from './models/AgentTask';

// Runtime context
export * from './runtime/AgentContext';
export * from './runtime/AgentWorker';
export * from './runtime/WorkerPool';
export * from './runtime/AgentCancellation';
export * from './runtime/SubAgentRuntime';

// Agents
export * from './agents/SubAgent';
export * from './agents/SearchAgent';
export * from './agents/RepositoryAgent';
export * from './agents/MemoryAgent';
export * from './agents/PatchAgent';
export * from './agents/ValidationAgent';
export * from './agents/TestAgent';
export * from './agents/WiCERAgent';
export * from './agents/ConventionAgent';

// Coordinator
export * from './coordinator/TaskGraph';
export * from './coordinator/DynamicTaskPlanner';
export * from './coordinator/ResultSynthesizer';

// Orchestration
export * from './orchestration/ParallelExecutor';
export * from './orchestration/FailureHandler';

// Metrics
export * from './metrics/SubAgentMetrics';
