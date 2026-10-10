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

### 1. Interactive Chat & Direct Invocation

Start the interactive developer chat or submit a goal directly from your shell:

```bash
# Start interactive console
agentos

# Submit initial goal directly (launches interactive console with task queued)
agentos "refactor auth middleware to use jwt verification"

# Non-interactive / headless run (ideal for CI, scripts, and automation)
agentos "run tests and fix failures" --non-interactive

# Start with specific reasoning model
agentos -m claude-3-5-sonnet

# Start in Plan Mode (read-only architectural exploration)
agentos --plan "audit database migration queries"

# Continue from a previous session
agentos --continue
agentos --continue session_1728500000000
```

In interactive chat, AgentOS supports rich slash commands:
- `/help` — Display interactive help and available slash commands
- `/plan` / `/build` — Hot-switch between Plan mode (read-only) and Build mode (mutations)
- `/model <id>` — Hot-switch active reasoning model
- `/undo` or `/revert [id]` — Surgically roll back file changes made during a run
- `/snapshots` — Inspect historical shadow checkpoints and snapshot timestamps
- `/diff` — Display pending unified diffs (or `Ctrl+D`)
- `/todos` — Toggle interactive task checklist (or `Ctrl+T`)
- `/research <query>` — Autonomous deep research with verified citations
- `/bugfix [target]` — Run project verifier, isolate errors, and propose minimal repair
- `/team <workflow> <goal>` — Dispatch multi-agent team (`deep-research`, `research-and-implement`, `investigate-and-fix`)
- `/clear` — Clear current conversation context

---

### 2. Complete CLI Command Reference

AgentOS implements the gold-standard CLI architectures from **Freebuff**, **OpenCode**, and **Qwen-Code**:

#### Project Initialization (`agentos init`)
Inspects the repository, detects ecosystem (`node`, `python`, `rust`, `go`), builds, tests, and scaffolds configuration:
```bash
agentos init
# Scaffolds .agentos/config.json, .agents/rules, .agents/subagents, and AGENTS.md
```

#### Model & Provider Management (`agentos models`)
Inspect, switch, and test reasoning models across Anthropic, OpenAI, DeepSeek, Google Gemini, Qwen/DashScope, Ollama, and LM Studio:
```bash
agentos models list                     # List all 24+ catalog models and active model
agentos models list -p anthropic        # Filter models by provider
agentos models set claude-3-5-sonnet    # Switch active reasoning model
agentos models test deepseek-chat       # Test provider API connectivity
agentos models providers                # Inspect supported providers and required env vars
```

#### Authentication & Credentials (`agentos auth` / `agentos login`)
Safely configure, inspect, and remove provider API keys:
```bash
agentos auth status                     # Show configured keys (masked) and environment sources
agentos auth set anthropic --key sk-*** # Save API key into ~/.agentos/config.json
agentos auth logout openai              # Clear saved credentials
```

#### Sessions & Conversation History (`agentos sessions`)
Inspect, resume, and export past conversational runs:
```bash
agentos sessions list                   # List past sessions, turns, and prompt snippets
agentos sessions show <session-id>      # Inspect turn details, messages, and tool executions
agentos sessions export <session-id>    # Export session transcript to Markdown or JSON
agentos sessions resume <session-id>    # Continue conversation in interactive console
```

#### Background Service & Daemon (`agentos service`)
Manage the background HTTP daemon:
```bash
agentos service status                  # Check if daemon is running on port 7070
agentos service start --background      # Start daemon in background
agentos service stop                    # Gracefully stop daemon
agentos service restart                 # Restart running daemon
```

#### Transcript Export (`agentos export`)
```bash
agentos export <sessionId> -o report.md # Export complete conversation to Markdown file
```

### 2. Multi-Harness Instruction Auto-Discovery

AgentOS seamlessly integrates with rules from other industry coding harnesses. On startup, it automatically discovers, parses, and incorporates project instructions from:
- `AGENTS.md` or `.agentos/instructions.md` (AgentOS native standard)
- `CLAUDE.md` (Claude Code instructions)
- `.cursorrules` or `.cursor/rules/*.md` (Cursor rules)
- `QWEN.md` or `.qwen/instructions.md` (Qwen Code rules)
- `GEMINI.md` (Gemini CLI instructions)

Instructions are parsed, attributed, and injected into the agent system context with clear origin markers.

### 3. Checkpoints & Surgical Rollback

AgentOS provides git-backed shadow snapshots and surgical change set backups:
- **Shadow Snapshots**: A lightweight git shadow tree checkpoint is created on every run turn without modifying user branches or commit history.
- **Surgical Rollback**: If you reject a change or run `/undo`, AgentOS prioritizes targeted change set backups (restoring only touched files) before falling back to shadow snapshot restoration. User uncommitted changes outside the agent's edits are never destroyed.

CLI rollback commands:
```bash
# List available shadow checkpoints and run backups
agentos snapshots

# Revert working directory to a specific snapshot
agentos revert <snapshot-id>
```

### 4. Interactive Terminal Multiplexer

For background tasks, dev servers, interactive debuggers, or test runners, AgentOS provides the `terminal_interactive` tool backed by `TerminalSessionManager`:
- `start`: Spawn a long-running process with persistent pseudo-terminal sessions
- `send`: Send input or control keys (including `Ctrl+C`)
- `capture`: Read buffered terminal output
- `wait`: Poll for specific output patterns or process completion
- `stop`: Gracefully terminate the process session

### 5. Multi-Agent Specialist Delegation & Deep Research

Complex tasks and external investigations are delegated to specialized subagents via `delegate_subagent`:
- `researcher-web`: Deep web researcher executing multi-round search, SSRF-safe page inspection, and primary source verification with URL citations
- `researcher-docs`: Specialized technical documentation researcher for major frameworks, libraries, runtimes, and APIs
- `explore`: Read-only codebase explorer for fast symbol reconnaissance
- `code-search`: Semantic and structural symbol search across files
- `analyzer`: In-depth AST and dependency diagnostic engine
- `test-runner`: Isolated test suite runner with failure attribution
- `browser_verifier`: Headless browser verification via Chrome DevTools snapshots, DOM inspection, and console error monitoring

### 6. Autonomous Deep Research

AgentOS replicates the multi-round research protocol from Freebuff and Qwen-Agent:
- **SSRF Protection**: `read_url` blocks loopback, private IPv4/IPv6, and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`) across all redirect hops.
- **Reader Extraction**: HTML parser strips advertising, tracking scripts, and stylesheets, extracting readable article/main prose with decoded entities.
- **Primary Source Hard Rule**: The agent is forbidden from relying solely on search snippets. It must read authoritative source pages before synthesizing its final answer.
- **Autonomous Dossiers**: Dispatches parallel web research, library documentation lookups, and codebase cross-checks, producing cited research dossiers.

Run research directly:
```bash
# Via CLI command
agentos research "Bun 1.1 cross-platform terminal shell"

# Or in interactive chat
/research Next.js 15 Server Actions best practices
/team deep-research React 19 compiler migration
```

### 7. Evaluation Harness

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
