# Example: Interactive Patch Review and Approval

This walkthrough explains how AgentOS handles changes that require explicit developer review before writing to disk.

---

## Scenario

A prompt requests refactoring a database migration script and updating critical dependencies:

```bash
agent run "Update database connection pooling in src/db/pool.ts and adjust retry limits"
```

---

## 1. Sandbox Isolation

1. The agent creates an isolated Git worktree under `.agentos/worktrees/`.
2. The agent reads `src/db/pool.ts` and applies candidate changes inside the sandbox.
3. Tests run inside the worktree to verify pool initialization under load.
4. The user's active repository files remain untouched during this phase.

---

## 2. Interactive Approval View

When the run finishes, or if a high-risk command was requested, AgentOS renders the interactive terminal approval screen (`ApprovalView`):

```text
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  Review Pending Changes (1 file modified, +14 / -4 lines) │
├─────────────────────────────────────────────────────────────┤
│ Target: src/db/pool.ts                                      │
│ Pre-image SHA-256: 4b2a8f...                                │
│ Changes:                                                    │
│   - maxConnections: 10                                      │
│   + maxConnections: 25                                      │
│   + idleTimeoutMillis: 30000                                │
│                                                             │
│ [A] Accept & Apply   [R] Reject & Discard   [D] View Diffs  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Developer Actions

- Press **A**: Accepts the changeset and applies it atomically to the real workspace with SHA-256 pre-image checking.
- Press **R**: Discards the sandbox changes completely. Workspace remains untouched.
- Press **D**: Displays the unified diff directly in the terminal pager.
- Or use CLI commands:
  ```bash
  # Inspect unified diff
  agent patch show

  # Save patch file to disk
  agent patch save ./pending.diff

  # Apply patch
  agent patch apply
  ```
