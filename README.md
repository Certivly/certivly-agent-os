# AgentOS

AgentOS is a robust, production-grade agentic operating system and runtime for AI coding assistants. Built with Bun and TypeScript, AgentOS combines state-of-the-art truthful execution loops, isolated sandboxes, atomic multi-file patch engines, truthful test verification, and automated evaluation harnesses.

---

## Architecture

The production runtime follows a strict, single-agent layered architecture:

```text
CLI (apps/cli)
 │
 └──> AgentRuntime (@agent-os/agent-runtime)
       │
       └──> AgentLoop
             ├──> Providers (@agent-os/providers)
             │     └── OpenAI, Anthropic, Gemini, OpenRouter, Fake/Scripted
             │
             ├──> Tools (@agent-os/tools)
             │     └── read_file, grep_files, list_dir, edit_file, write_file,
             │         patch_file, run_command, get_repo_outline, search_symbol
             │
             ├──> Sandbox (@agent-os/sandbox)
             │     └── Git worktrees, process isolation, environment stripping
             │
             ├──> Verification (@agent-os/agent-runtime)
             │     └── Project script discovery (typecheck, lint, test, build),
             │         automated feedback loop & fix attempts
             │
             └──> Patch Engine & Approval (@agent-os/patch-engine)
                   └── Unified diffs, SHA-256 conflict detection, atomic rollback
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- Git (2.30+)
- Python 3 (optional, for python evaluation tasks)

### Installation

```bash
bun install
```

---

## Usage

### 1. Interactive Chat

Start the interactive developer chat:

```bash
# Start CLI session
bun run start

# Or directly
bun run apps/cli/src/index.ts
```

### 2. Evaluation Harness

AgentOS features an evaluation harness capable of loading isolated benchmark tasks, executing agents in headless sandboxes, and verifying code patches truthfully.

```bash
# Run all benchmark evaluation tasks with the scripted solver
bun run eval --task all --model fake:scripted

# Run smoke test tasks
bun run eval --task smoke --model fake:scripted

# Run a specific task with an LLM provider
bun run eval --task ts-off-by-one --model openrouter:anthropic/claude-3.5-sonnet

# Save and compare evaluation runs
bun run eval --task all --output results-v1.jsonl
bun run eval --task all --compare results-v1.jsonl
```

---

## Safety Modes

AgentOS operates under three strict command and filesystem permission modes:

1. **`read-only`**:
   - Forbids all file edits, writes, and deletions.
   - Forbids modifying shell commands (`rm`, `mv`, `git commit`, `npm install`, etc.).
   - Only inspection tools (`read_file`, `grep_files`, `list_dir`, `get_repo_outline`, `search_symbol`) and read-only commands (`git status`, `ls`, `cat`) are permitted.

2. **`workspace-write`** (Default):
   - Confines all file modifications to the current workspace root.
   - Forbids path traversal (`..` escape) and symlink escaping.
   - Forbids modifications to `.git/` metadata directly.
   - Evaluates shell commands against a 40+ rule safety policy; blocks destructive system commands.

3. **`full-access`**:
   - Grants full execution capabilities.
   - Emits structured audit telemetry (`command.executed`, `approval.requested`) over the event bus for every operation.

---

## Tool Authoring Guide

All tools in AgentOS adhere to the `ToolContract` interface in `@agent-os/tools`:

```typescript
import { ToolContract, ToolExecutionContext, ToolResult } from '@agent-os/tools';

export const myCustomTool: ToolContract = {
  name: 'my_custom_tool',
  description: 'Explain what this tool does concisely',
  readOnly: false,
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Target parameter' },
    },
    required: ['target'],
  },
  async execute(params: { target: string }, context: ToolExecutionContext): Promise<ToolResult> {
    // context provides workspaceRoot, abortSignal, logger, etc.
    return {
      success: true,
      content: `Processed ${params.target}`,
    };
  },
};
```

Register the tool with the global or session `ToolRegistry`:

```typescript
import { ToolRegistry } from '@agent-os/tools';

ToolRegistry.register(myCustomTool);
```

The tool is automatically adapted for `AgentLoop` and exposed to provider schemas.

---

## Run Summaries

Every execution of `AgentLoop` returns a strongly-typed `RunSummary`:

```typescript
interface RunSummary {
  sessionId: string;
  success: boolean;
  finalText: string;
  turns: number;
  approxInputTokens: number;
  approxOutputTokens: number;
  toolCalls: Array<{ id: string; name: string; args: any; success: boolean }>;
  commands: Array<{ command: string; exitCode: number }>;
  filesChanged: string[];
  verification?: {
    verdict: 'verified' | 'failed' | 'unverified';
    results: ScriptRunResult[];
    failureFeedback?: string;
  };
  verificationAttempts: number;
  errors: string[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
}
```

Summaries are emitted as `agent.loop.completed` events onto the shared `LoggingEventBus`.

---

## Patch Approval, Application & Rollback

AgentOS provides an atomic, conflict-safe patch engine:

1. **ChangeSet Generation**:
   Generates structured `ChangeSet` objects with file additions, modifications, and deletions. Each modification tracks a baseline SHA-256 content hash.

2. **Conflict Detection**:
   `ChangeSetApplier` checks current file contents against the baseline hash before applying hunks. If a file has been modified externally, the apply operation is safely rejected with conflict details.

3. **Approval**:
   In interactive CLI modes, patch bundles trigger an `approval.requested` event, presenting a formatted unified diff for human inspection.

4. **Atomic Rollback**:
   If an error occurs during multi-file application, `PatchRollback` immediately restores all affected files to their exact pre-patch contents.

---

## Monorepo Layout

### Active Packages

- `apps/cli`: Commander-based interactive terminal, daemon runner, and evaluation CLI.
- `packages/agent-runtime`: Truthful agent loop, context compacting, and verification runner.
- `packages/brain`: RAG retrieval engine, convention engine, and memory stores.
- `packages/config`: Central configuration schemas and environment loaders.
- `packages/context`: Context assembler and token window tracking.
- `packages/daemon`: Background long-running service pool.
- `packages/events`: Structured event bus and event definitions.
- `packages/memory`: Ephemeral and persistent session memory.
- `packages/metrics`: Runtime telemetry counters and timers.
- `packages/parser`: Syntax trees, AST manipulation, and chunk parsing.
- `packages/patch-engine`: ChangeSet models, SHA-256 conflict detection, and atomic rollback.
- `packages/providers`: LLM clients (OpenAI, Anthropic, Gemini, OpenRouter, Fake/Scripted).
- `packages/repository`: Git indexer, symbol graphs, and incremental repo map.
- `packages/runtime-audit`: Boundary import scanner, reachability checker, and system doctor.
- `packages/sandbox`: Git worktree isolation, process timeouts, and secret stripping.
- `packages/sessions`: Session lifecycle and message histories.
- `packages/shared`: Logging event bus, JSON logger, and common error hierarchies.
- `packages/tools`: Tool contracts, read/grep/list, edit/patch/write, command policy engine, repo map tools.

### Quarantined Packages (`archive/packages/`)

Unused legacy packages (such as `subagents`, `orchestrator`, `planner`, `seol`, `wicer`, `skills`, `narrative`, etc.) have been quarantined to `archive/packages/`. See `archive/README.md` for individual revival criteria and evaluation benchmarks required prior to re-integration.

---

## Release Gate

Before releasing or committing changes, run the release gate:

```bash
bun run gate
```

The gate executes:
1. `bunx tsc --noEmit` — Validates TypeScript types across the monorepo.
2. `bun test` — Executes all active package test suites.
3. `bun run build` — Compiles the CLI distribution.
4. `bun run eval --task smoke --model fake:scripted` — Verifies end-to-end evaluation harness and model solvers.
