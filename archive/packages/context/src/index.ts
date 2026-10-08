/**
 * ARCHIVED PACKAGE: @agent-os/context
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Zero live imports; context assembled inline in AgentLoop
 *
 * Revival condition: Eval showing context stack improves multi-turn pass rate
 *
 * To revive: move this directory back to packages/context/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

// Reason: Zero live imports; context is assembled inline in AgentLoop.
// Revival condition: Eval showing structured context stack improves pass rate.

export * from './models';
export * from './stack';
