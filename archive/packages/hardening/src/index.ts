/**
 * ARCHIVED PACKAGE: @agent-os/hardening
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Replaced by sandbox policy engine
 *
 * Revival condition: Security benchmark demonstrating sandbox boundary bypass resistance
 *
 * To revive: move this directory back to packages/hardening/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

export * from './diagnostics/HeapAnalyzer';
export * from './diagnostics/LeakDetector';
export * from './diagnostics/MemoryInspector';
export * from './diagnostics/RuntimeProfiler';
export * from './diagnostics/WorkspaceConsistencyValidator';
