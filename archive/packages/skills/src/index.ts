/**
 * ARCHIVED PACKAGE: @agent-os/skills
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Replaced by WorkspaceTool contracts
 *
 * Revival condition: Complex tool orchestration eval proving skill composition superior
 *
 * To revive: move this directory back to packages/skills/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

export * from './models';
export * from './registry';
export * from './pipeline';
export * from './standard';
export * from './standard/AnalyzeRepositorySkill';
export * from './standard/SearchCodebaseSkill';
export * from './standard/SkillExecutor'; // exports RuntimeSkillDispatcher


