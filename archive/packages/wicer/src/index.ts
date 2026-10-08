/**
 * ARCHIVED PACKAGE: @agent-os/wicer
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Replaced by BM25 repository indexer
 *
 * Revival condition: Cache hit rate >95% on 100k+ LoC codebases
 *
 * To revive: move this directory back to packages/wicer/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

export * from './models';
export * from './store';
export * from './engines';
export * from './compiler/wiki-compiler';
export * from './api';
