# AgentOS — Complete System Architecture

AgentOS is a **deterministic autonomous software engineering operating system and runtime** designed to understand, plan, execute, truthfully verify, and safely patch work inside real software repositories.

Unlike traditional AI coding tools that act as unconstrained wrappers around model outputs, AgentOS treats the AI model as a reasoning engine inside a deeply structured, evidence-grounded execution pipeline.

For the full detailed documentation, see [docs/architecture.md](docs/architecture.md).

---

## 1. Architectural Principles

### 1. Repository First
AgentOS never begins from generic AI assumptions. It parses the codebase itself via Tree-sitter ASTs, dependency graphs, and lexical BM25 ranking. The repository is the primary source of truth.

### 2. Truthful Verification Before Approval
Code modifications are never trusted on faith. AgentOS automatically discovers project test runners (`bun test`, `npm test`, `pytest`, `cargo test`, `tsc`) and executes them in an isolated sandbox, requiring compiler and test validation before proposing changes to the developer.

### 3. Sandboxed Worktree Isolation
All filesystem edits and tool executions occur inside isolated Git worktrees (`packages/sandbox`). Live user workspaces remain completely pristine until verification succeeds and changes are reviewed.

### 4. Atomic Conflict Safety & Rollback
Every file modification tracks a baseline SHA-256 pre-image content hash. If files drift externally, patches are safely rejected rather than overwriting work. Shadow snapshots and surgical change set backups guarantee instant rollback (`/undo`, `agentos snapshots`, `agentos revert`).

### 5. Event-Sourced Auditability
Every turn, tool call, command output, and verification result is recorded as an immutable event with automated credential redaction.

---

## 2. Complete Live Path Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Developer Interfaces                            │
│   ┌───────────────────────────────┐  ┌─────────────────────────────┐   │
│   │           apps/cli            │  │        apps/desktop         │   │
│   │  (Commander, Ink TUI, REPL)   │  │  (Electron, React 19, GUI)  │   │
│   └───────────────┬───────────────┘  └──────────────┬──────────────┘   │
└───────────────────┼─────────────────────────────────┼──────────────────┘
                    │                                 │
                    ▼                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Core Runtime Layer (packages/agent-runtime)              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ AgentRuntime  •  AgentLoop  •  LightweightPlanner                │  │
│  │ ProjectVerifier  •  ParallelExplorer  •  SubagentRegistry        │  │
│  │ TeamCoordinator  •  SkillRegistry  •  SkillMiner/Optimizer       │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       ▼                              ▼                              ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│  providers   │              │    tools     │              │   sandbox    │
│ (LLM APIs &  │              │ (Execution   │              │ (Git Worktree│
│  Streaming)  │              │  & Policy)   │              │  Isolation)  │
└──────┬───────┘              └──────┬───────┘              └──────┬───────┘
       │                             │                             │
       ▼                             ▼                             ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│  repository  │              │ patch-engine │              │   sessions   │
│ (Tree-Sitter,│              │ (Diffs, Pre- │              │ (SQLite, Run │
│  RepoMap)    │              │  Image SHA)  │              │  Histories)  │
└──────────────┘              └──────────────┘              └──────────────┘
       ▲                             ▲                             ▲
       └─────────────────────────────┼─────────────────────────────┘
                                     ▼
                      ┌──────────────────────────────┐
                      │    Append-Only Event Bus     │
                      │  (.agentos/traces/, Metrics) │
                      └──────────────────────────────┘
```

---

## 3. End-to-End Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant UI as CLI / Desktop UI
    participant RT as AgentRuntime
    participant Dis as Instruction Discovery
    participant Rep as Repository (RepoMap)
    participant Loop as AgentLoop
    participant LLM as Model Provider
    participant Box as Sandbox Worktree
    participant Ver as ProjectVerifier
    participant Pat as PatchEngine
    participant Bus as EventBus

    Dev->>UI: Submit prompt / task goal
    UI->>RT: Initialize session & request lifecycle
    RT->>Dis: Ingest instructions (AGENTS.md, CLAUDE.md, .cursorrules)
    RT->>Rep: Build symbol index & extract relevant files via RepoMap
    RT->>Loop: Execute agent loop with context & safety boundaries

    loop Execution & Verification Turns
        Loop->>LLM: Stream prompt, tools & instructions
        LLM-->>Loop: Tool call stream (e.g. edit_file, run_command)
        Loop->>Box: Validate against safety policy & execute in isolated worktree
        Box-->>Loop: Structured tool result
        Loop->>Ver: Discover & run verification tests (test, typecheck, lint)
        alt Tests Fail
            Ver-->>Loop: Test failure output & diagnostics
            Loop->>LLM: Closed-loop repair prompt (up to 3 repair turns)
        else Tests Pass
            Ver-->>Loop: Verification verified [OK]
        end
    end

    Loop->>Pat: Generate unified diff with SHA-256 baseline hashes
    Pat-->>UI: Present ApprovalView with visual diff & risk assessment
    Dev->>UI: Confirm patch approval
    UI->>Pat: Apply patch atomically to user workspace
    Pat->>Box: Capture shadow snapshot checkpoint
    Loop->>Bus: Emit run summary & persist sanitized trace
    UI->>User: Display completed summary & results
```

---

## 4. Package Ownership & Structure

| Package / Directory | Scope & Role |
| :--- | :--- |
| `apps/cli` | Interactive Ink terminal interface, command routing, and slash command REPL. |
| `apps/desktop` | Electron + React 19 desktop application with visual diff inspector and key vault. |
| `packages/agent-runtime` | Truthful agent execution loop, reactive planner, test verifier, subagent coordinator. |
| `packages/providers` | Unified streaming LLM adapters (Anthropic, OpenAI, Gemini, DeepSeek, Ollama, LM Studio). |
| `packages/tools` | Workspace filesystem operations, command safety matrix, SSRF-safe web reader. |
| `packages/sandbox` | Isolated Git worktrees, process lifecycle, environment variable sanitization, shadow snapshots. |
| `packages/patch-engine` | Unified diff generation, SHA-256 pre-image conflict detection, atomic rollback. |
| `packages/repository` | Source code intelligence, Tree-sitter AST parsing, `RepoMap` generation, graph centrality. |
| `packages/runtime-audit` | Dependency graph inspection, reachability verification, boundary import checks, system doctor. |
| `packages/config` | Hierarchical configuration loader (`agentos.config.json`), workspace trust manager. |
| `packages/sessions` | SQLite session persistence, message histories, run summaries. |
| `packages/events` | Append-only event store and typed event definitions. |
| `packages/metrics` | Telemetry metric registry, counters, timers, and performance budgets. |
| `packages/shared` | Logging event bus, JSON logger, and common error hierarchies. |
| `evals/` | Deterministic benchmark tasks, fixture repositories, and evaluation runner. |
| `archive/` | Quarantined legacy and experimental packages kept for historical reference. |

---

## 5. Security & Isolation Architecture

1. **Permission Modes**:
   - `plan`: Read-only exploration. All file edits and commands are forbidden.
   - `manual`: Requires explicit developer confirmation for every file edit and command.
   - `acceptEdits`: Automatically approves file modifications while requiring confirmation for shell commands.
   - `auto`: Automatically approves edits and low-risk inspection commands (`bun test`, `tsc`, `git diff`).
2. **Filesystem Containment**: `WorkspaceManager` blocks relative path traversal (`../`), URL schemes, Windows device handles, and direct access to `.git/` metadata.
3. **Command Policy Matrix**: 40+ rules block destructive operations (`rm -rf`, `git push --force`, `git reset --hard`) and encoded execution wrappers.
4. **Secret Redaction**: Telemetry traces recorded to `.agentos/traces/` automatically mask and redact provider API keys, GitHub tokens, AWS credentials, and private keys.

For complete architectural details, see [docs/architecture.md](docs/architecture.md).
