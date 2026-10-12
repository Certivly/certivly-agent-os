# AgentOS System Architecture

AgentOS is a **deterministic autonomous software engineering operating system and runtime** designed to understand, plan, execute, truthfully verify, and safely patch work inside real-world software repositories.

Unlike traditional AI coding tools that act as unconstrained wrappers around model outputs, AgentOS treats the AI model as a reasoning engine inside a deeply structured, evidence-grounded execution pipeline.

---

## 1. Core Architectural Tenets

1. **Repository First**: Grounded in the actual workspace codebase (Tree-sitter ASTs, dependency graphs, BM25 symbol ranking) rather than speculative LLM assumptions.
2. **Truthful Verification**: Code changes are never trusted on faith. AgentOS discovers and executes real project test suites inside sandboxes, demanding compiler and test confirmation before human approval.
3. **Isolated Execution**: All filesystem modifications occur inside isolated Git worktrees. User working trees remain pristine until verification succeeds.
4. **Atomic Conflict Safety**: Every file modification tracks a baseline SHA-256 pre-image hash. If files drift externally, patches are safely rejected rather than clobbering work.
5. **Event-Sourced Observability**: Every turn, tool call, command output, and verification result is recorded as an immutable event with automated credential redaction.
6. **Zero Accidental Loss**: Shadow snapshot checkpoints and targeted change backups ensure developers can surgically roll back changes at any time.

---

## 2. High-Level System Architecture

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

## 3. Package Responsibilities & Ownership

| Package / Directory | Ownership & Responsibilities |
| :--- | :--- |
| `apps/cli` | Terminal entrypoints (`agentos`, `chat`, `run`, `doctor`, `models`, `auth`, `skills`, `desktop`, `eval`). Interactive Ink TUI components, syntax-highlighted diff viewer, and REPL. |
| `apps/desktop` | Electron + React 19 desktop application, Key Vault, Visual Diff Inspector, Workspace Explorer, and session playback. |
| `packages/agent-runtime` | `AgentRuntime`, `AgentLoop`, `LightweightPlanner`, `ProjectVerifier`, `ParallelExplorer`, `ShadowSnapshotManager`, `SubagentRegistry`, `TeamCoordinator`, `SkillRegistry`, `SkillMiner`, and `SkillOptimizer`. |
| `packages/providers` | Unified model interfaces (`BaseModel`, `OpenAIModel`, `AnthropicModel`, `GeminiModel`, `DeepSeekModel`, `OllamaModel`, `LMStudioModel`, `FakeScriptedModel`), streaming tool call parser, and token cost accounting. |
| `packages/tools` | Core tools (`read_file`, `write_file`, `edit_file`, `patch_file`, `run_command`, `list_dir`, `grep_files`, `terminal_interactive`, `read_url`, `web_search`, `read_docs`, `repo_map`, `search_symbols`), 40+ rule command policy engine, and SSRF filter. |
| `packages/sandbox` | Isolated Git worktree lifecycle management, process isolation, environment variable sanitization, and shadow snapshots. |
| `packages/patch-engine` | Unified diff generation, SHA-256 pre-image conflict detection, patch application, and atomic rollback. |
| `packages/repository` | Source code intelligence, Tree-sitter AST parsing, `RepoMap` generation, BM25 lexical ranking, and graph centrality analysis. |
| `packages/runtime-audit` | Monorepo boundary import scanner, reachability checker, package usage reporter, and system doctor. |
| `packages/config` | Hierarchical configuration loader (`agentos.config.json`, `.agentos/config.json`), environment loader, and workspace trust manager. |
| `packages/sessions` | SQLite session persistence, message histories, turn metadata, and export utilities. |
| `packages/events` | Append-only event store, event bus interface, and typed event schemas. |
| `packages/metrics` | Telemetry metric registry, counters, timers, and performance budgets. |
| `packages/shared` | Logging event bus, structured JSON logger, and common error hierarchies. |
| `evals/` | Deterministic evaluation harness, reproducible coding bug tasks, and regression gates. |
| `archive/` | Quarantined legacy and experimental modules preserved for reference. |

---

## 4. End-to-End Live Execution Sequence

The complete request lifecycle follows a 9-stage deterministic pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer
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

    User->>UI: Submit prompt / task goal
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
    User->>UI: Confirm patch approval
    UI->>Pat: Apply patch atomically to user workspace
    Pat->>Box: Capture shadow snapshot checkpoint
    Loop->>Bus: Emit run summary & persist sanitized trace
    UI->>User: Display completed summary & results
```

### Detailed Lifecycle Stages

### Stage 1: Ingestion & Multi-Harness Instruction Auto-Discovery
On invocation, `AgentRuntime` automatically inspects the workspace root to discover and attribute instructions from:
- `AGENTS.md` or `.agentos/instructions.md` (Native standard)
- `CLAUDE.md` (Claude Code instructions)
- `.cursorrules` or `.cursor/rules/*.md` (Cursor instructions)
- `QWEN.md` or `.qwen/instructions.md` (Qwen Code guidelines)
- `GEMINI.md` (Gemini CLI instructions)

Instructions are parsed, attributed, and injected into the system prompt with origin markers.

### Stage 2: Repository Intelligence (`RepoMap`)
`packages/repository` compiles an AST-based representation of the repository:
- Extracts classes, functions, interfaces, and imports using Tree-sitter.
- Computes graph centrality to identify architectural anchor files.
- Scores candidates using a hybrid of BM25 lexical relevance and test affinity.
- Assembles a compact, token-thrifty `RepoMap` to guide LLM reasoning.

### Stage 3: Reactive Planning
Rather than constructing brittle upfront task graphs that break on compiler errors, `LightweightPlanner` operates reactively:
- Triggers when complexity thresholds fire (multi-file prompt, 3+ candidate files, prior verification failures).
- Maintains a lightweight task checklist (`todowrite`) visible in the interactive TUI.
- Dynamically updates pending items as compiler and test feedback arrives.

### Stage 4: Model Invocation & Tool Streaming
The active provider streams model responses and tool invocations:
- Unified streaming parser guarantees parity across OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and LM Studio.
- Partial chunks are accumulated into typed `ToolCall` events.

### Stage 5: Sandboxed Execution & Safety Guardrails
All mutations execute inside `packages/sandbox`:
- **Git Worktree Isolation**: Modifications take place in a temporary Git worktree branch (`.agentos/worktrees/`).
- **Filesystem Containment**: `WorkspaceManager` blocks relative traversals (`../`), UNC shares, Windows device paths, and `.git/` metadata.
- **Command Security Matrix**: 40+ policy rules block destructive commands (`rm -rf`, `git push --force`, `git reset --hard`) and encoded execution wrappers.
- **SSRF Prevention**: Network tools (`read_url`) reject loopback, private IP subnets, and cloud metadata addresses.

### Stage 6: Truthful Verification Loop (`ProjectVerifier`)
Before code changes are shown to the developer:
1. `ProjectVerifier` automatically discovers project test scripts (`package.json`, `Makefile`, `Cargo.toml`, `pyproject.toml`).
2. Executes tests inside the sandbox.
3. If tests fail, the compiler output and assertion failures are routed back to the LLM for automated diagnostic self-repair (up to 3 iterations).
4. If tests pass, the run is flagged as `verified`.

### Stage 7: Patch Engine & Pre-Image Conflict Safety
`packages/patch-engine` handles patch creation and application:
- Computes unified diffs across touched files.
- Attaches the pre-edit SHA-256 content hash of each file as a pre-image baseline.
- Validates that current workspace files match the baseline SHA-256 before applying.
- Rejects application if external edits occurred, preventing silent overwrite.

### Stage 8: Shadow Snapshots & Surgical Rollback
- On every completed turn, `ShadowSnapshotManager` captures a lightweight Git tree checkpoint without altering branch commits.
- If the operator invokes `/undo` or `agentos revert`, AgentOS uses surgical change set backups to restore only touched files, preserving unrelated user edits.

### Stage 9: Observability & Secret Redaction
- Every run emits a structured `RunSummary` over the shared `LoggingEventBus`.
- Complete execution traces are persisted to `.agentos/traces/<runId>.jsonl`.
- The secret redaction engine masks API keys, bearer tokens, AWS credentials, and private keys prior to serialization.

---

## 5. Subsystems Deep-Dive

### Specialized Subagents & Team Coordination
Complex or multifaceted goals are delegated to specialized subagents via `SubagentRegistry` and `TeamCoordinator`:

- `researcher-web`: Deep web researcher executing multi-round search, SSRF-safe page inspection, and primary-source verification with URL citations.
- `researcher-docs`: Specialized technical documentation researcher for major frameworks, libraries, runtimes, and APIs.
- `explore`: Read-only codebase explorer for fast symbol reconnaissance.
- `code-search`: Structural and semantic symbol search across files.
- `analyzer`: In-depth AST and dependency diagnostic engine.
- `test-runner`: Isolated test suite runner with failure attribution.
- `browser_verifier`: Headless browser verification via Chrome DevTools snapshots, DOM inspection, and console error monitoring.

Coordinated workflows:
- `deep-research`: Multi-source parallel investigation synthesizing comprehensive research dossiers.
- `research-and-implement`: Investigates external APIs or patterns, formulates an implementation plan, and executes sandboxed code edits.
- `investigate-and-fix`: Isolates regression bugs, runs targeted tests, and produces minimal verified repairs.

### Closed-Loop Skills System
AgentOS implements a modular, self-improving skills architecture:
1. **Authoring**: Skills are defined as standard `SKILL.md` markdown files with YAML frontmatter, objectives, workflow recipes, and tool whitelists.
2. **Mining**: `agentos skills mine` analyzes session traces from `.agentos/sessions/sessions.db` to automatically extract reusable skills from successful multi-turn workflows.
3. **Text-Space Optimization**: `agentos skills optimize` executes closed-loop prompt refinement against target evaluation tasks, iteratively improving skill prompt wording.

### Dual Form Factor: TUI + Desktop App
- **Interactive Terminal UI (`apps/cli`)**: Built with React and Ink, providing an interactive console with syntax-highlighted diffs, task checklists, and hot-swappable modes (`/plan` vs `/build`).
- **Desktop Application (`apps/desktop`)**: Built with Electron and React 19, featuring an intuitive graphical user interface with a secure Key Vault, Visual Diff Inspector, Workspace Explorer, and session playback.

---

## 6. Archived Packages & Isolation Policy

Older experimental systems have been retired to `archive/` to keep the live execution path deterministic, maintainable, and fast:

- `archive/orchestrator`: Retired multi-agent orchestrator superseded by unified `AgentLoop`.
- `archive/planner`: Over-engineered hierarchical planner replaced by reactive `LightweightPlanner`.
- `archive/wicer`, `archive/seol`: Experimental context engines consolidated into `packages/repository`.
- `archive/pattern-intelligence`: Experimental rule-mining engine consolidated into `packages/memory`.

> **Policy**: Code in `archive/` is never imported into the live execution path. Any feature revival from `archive/` requires a rigorous evaluation experiment proving measurable improvement on eval benchmarks. See [`archive/README.md`](../archive/README.md).
