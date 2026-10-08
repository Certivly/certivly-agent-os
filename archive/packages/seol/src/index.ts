/**
 * ARCHIVED PACKAGE: @agent-os/seol
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Merged into @agent-os/brain (also archived)
 *
 * Revival condition: Optimization benchmark proving caching improves latency >20%
 *
 * To revive: move this directory back to packages/seol/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

export * from './profiler/types';
export * from './profiler/ExecutionProfiler';
export * from './analyzer/types';
export * from './analyzer/OptimizationAnalyzer';
export * from './planner/types';
export * from './planner/OptimizationPlanner';
export * from './validator/EquivalenceTester';
export * from './validator/OptimizationValidator';
export * from './runtime/CacheManager';
export * from './runtime/ContextReuseManager';
export * from './runtime/SeolProxy';
export * from './events/event-types';
export * from './metrics/metrics';
export * from './errors';
