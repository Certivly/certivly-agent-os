# Plan 06: Shadow Git Checkpoints & Surgical Per-Turn Rollback

**Document:** `plans/v2/06-shadow-git-checkpoints-and-rollback.md`  
**Date:** 2026-10-09  
**Status:** Implementation Specification  
**Benchmark Source:** OpenCode (`packages/core/src/snapshot.ts`)

---

## 1. Problem Statement & Motivation

When an AI agent modifies code across 5 turns, mistakes can happen:
- The agent introduces syntax regressions or architectural dead ends.
- The user decides to reject the last 2 turns and try an alternative approach.

In standard systems, reverting is dangerous:
- Running `git checkout -- .` or `git reset --hard` **destroys all uncommitted files the developer had before the agent ran**.
- Re-prompting the model with *"Please undo your last change"* wastes tokens, frequently fails on deleted/renamed files, and often introduces new bugs.

---

## 2. OpenCode Architecture Pattern (`packages/core/src/snapshot.ts`)

OpenCode solves this using an isolated **Shadow Git Snapshot Repository**:
1. **Detached Shadow Git Directory**:
   - Maintains a hidden git object store in `~/.opencode/snapshot/<project_id>/<worktree_hash>`.
   - Never attaches to or mutates the user's active git branch or `.git/HEAD`.
2. **Content-Addressed Tree Capture**:
   - Before executing any mutating tool (`write_file`, `edit_file`, `apply_patch`), it captures a content-addressed tree snapshot (`Snapshot.capture()`).
   - Returns a lightweight tree hash (`Snapshot.ID`).
3. **Surgical Per-Turn Rollback**:
   - Can diff any two snapshots: `snapshot.diff({ from: id1, to: id2 })`.
   - Restores *strictly* the specific project files modified between those snapshots.
   - Any files untouched by the agent remain completely pristine.

---

## 3. AgentOS Engineering Specification

### 3.1. Subsystem Architecture: `packages/sandbox/src/snapshot/ShadowSnapshotManager.ts`

```typescript
export type SnapshotId = string;

export interface SnapshotDiff {
  path: string;
  kind: 'added' | 'modified' | 'deleted';
  patch: string;
}

export class ShadowSnapshotManager {
  private shadowGitDir: string;

  constructor(
    private workspaceRoot: string,
    private storageRoot?: string
  ) {}

  public async init(): Promise<void>;

  /**
   * Captures the current workspace file tree into the shadow git store.
   * Runs in < 15ms by adding index entries without touching active .git.
   */
  public async capture(): Promise<SnapshotId>;

  /**
   * Generates unified diffs between two captured snapshots.
   */
  public async diff(from: SnapshotId, to: SnapshotId): Promise<SnapshotDiff[]>;

  /**
   * Reverts specific files or the entire delta between two snapshots.
   */
  public async rollback(
    toSnapshotId: SnapshotId,
    filePaths?: string[]
  ): Promise<{ revertedFiles: string[] }>;
}
```

### 3.2. Lifecycle in AgentLoop

```typescript
// packages/agent-runtime/src/loop/AgentLoop.ts
const turnSnapshotId = await this.snapshotManager.capture();
this.turnSnapshots.set(turns, turnSnapshotId);

// If user cancels or if verification repair fails completely:
if (shouldRollback) {
  const targetSnapshot = this.turnSnapshots.get(originalTurn);
  await this.snapshotManager.rollback(targetSnapshot, filesChangedInTurn);
  this.eventBus.publish('agent.turn.reverted', { turn: turns, targetTurn: originalTurn });
}
```

---

## 4. User Interaction & CLI Integration

Expose interactive commands in `apps/cli`:
- `/snapshots`: Lists all captured turn checkpoints with timestamps and modified file counts.
- `/diff [turn]`: Displays visual unified diff between current state and a specific turn snapshot.
- `/revert [turn]`: Surgically rolls back workspace files to that exact turn state in under 50ms.

---

## 5. Verification & Acceptance Criteria
- [ ] Shadow repository operates independently without altering user's `.git` branch or HEAD.
- [ ] Uncommitted user changes existing prior to agent execution are preserved across rollbacks.
- [ ] Added, modified, and deleted files are all restored accurately to the exact snapshot state.
- [ ] Benchmark performance: snapshot capture overhead is $< 20\text{ms}$ per turn.
