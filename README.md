<div align="center">

# ⚡ AgentOS

**The Deterministic Autonomous Software Engineering Operating System & Runtime**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun: >=1.1](https://img.shields.io/badge/Bun-%3E%3D1.1-black.svg?logo=bun)](https://bun.sh)
[![TypeScript: 5.0](https://img.shields.io/badge/TypeScript-5.0-blue.svg?logo=typescript)](https://www.typescriptlang.org)
[![Tests: 911 passing](https://img.shields.io/badge/Tests-911%20passing-brightgreen.svg)](#quality-gate)
[![Platform: Linux | macOS | Windows](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)](#installation)

<p align="center">
  <a href="#key-features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#usage-modes">Usage Modes</a> •
  <a href="#command-reference">CLI Reference</a> •
  <a href="#slash-commands">Slash Commands</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#supported-models">Supported Models</a> •
  <a href="docs/architecture.md">Docs</a>
</p>

</div>

---

## 💡 What is AgentOS?

Most AI coding assistants are thin wrappers around `LLM → Tool Call → Response`. When models hallucinate file paths, break builds, or introduce regressions, developers are left cleaning up the mess.

**AgentOS** is fundamentally different. It is an **autonomous software engineering operating system and runtime** designed to understand, plan, execute, truthfully verify, and safely patch real-world software repositories.

AgentOS treats AI models as reasoning engines within a deeply structured, evidence-grounded execution pipeline:
- **Never hallucinates edits on live code**: All filesystem operations occur in isolated Git worktrees.
- **Truthful test-driven verification**: Discovers and runs project tests (`bun test`, `npm test`, `pytest`, `cargo test`, `tsc`) inside the sandbox and performs automated closed-loop self-repair before asking for approval.
- **Atomic conflict safety**: Changes are validated against baseline SHA-256 content hashes, presenting visual diffs with instant one-click rollback.
- **Dual form factor**: Runs as a lightning-fast interactive terminal console (Ink TUI) or as a sleek desktop app (Electron + React 19) with a visual Key Vault and Diff Inspector.

---

## 🌟 Key Features

| Capability | Description |
| :--- | :--- |
| 🛡️ **Sandboxed Worktree Execution** | Edits occur in isolated Git worktrees (`packages/sandbox`). Live repository files remain pristine until verification passes. |
| 🔍 **Automated Test Verification & Self-Repair** | Automatically discovers project verification scripts (`typecheck`, `lint`, `test`, `build`). Failures trigger autonomous diagnostic repair loops (up to 3 turns). |
| 🔄 **Atomic Patch Engine & Shadow Snapshots** | Unified diff generation with pre-image SHA-256 conflict detection. Surgical rollback (`/undo`, `agentos snapshots`, `agentos revert`) restores touched files without clobbering external user work. |
| 🧠 **Multi-Harness Instruction Auto-Discovery** | Automatically discovers and attributes guidelines from `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `QWEN.md`, and `GEMINI.md`. |
| 👥 **Specialized Subagents & Autonomous Teams** | Dispatches focused tasks to subagents (`researcher-web`, `researcher-docs`, `explore`, `code-search`, `analyzer`, `test-runner`, `browser_verifier`) or multi-agent teams (`deep-research`, `research-and-implement`, `investigate-and-fix`). |
| 🌐 **Autonomous Deep Research** | Multi-round web and technical documentation research with SSRF-safe page inspection, reader extraction, and a strict **Primary Source Hard Rule** forbidding unverified snippet summaries. |
| 🛠️ **Closed-Loop Skills System** | Pluggable `SKILL.md` workflows, automatic mining of reusable skills from past successful runs, and closed-loop text-space prompt optimization against verification benchmarks. |
| 🖥️ **Dual Form Factor: TUI + Desktop App** | Rich terminal interface with syntax-highlighted diffs, task checklists, and slash commands — plus an Electron + React 19 desktop GUI with Key Vault and Diff Inspector. |
| 🔌 **Universal Model Provider Support** | First-class adapters for Anthropic Claude 3.5 Sonnet, OpenAI GPT-4o / o1 / o3-mini, Google Gemini 2.0 Flash, DeepSeek V3 / R1, and local inference via Ollama and LM Studio. |
| 🩺 **Built-In System Doctor & Runtime Audit** | Self-auditing doctor (`agentos doctor`) tests provider connectivity, plugin governance, and MCP server health, while preventing dead-code boundary leaks. |
| 📊 **Deterministic Evaluation Harness** | Standalone benchmark suite (`evals/tasks/`) with reproducible bug fixtures and scripted solvers ensuring zero regressions across releases. |

---

## 🚀 Quick Start

### 1. Prerequisites

- [Bun](https://bun.sh) (v1.1.0 or higher)
- [Git](https://git-scm.com) (v2.30 or higher)

### 2. Installation

#### Clone & Build from Source

```bash
git clone https://github.com/syednajamabbas/agent-os.git
cd agent-os
bun install
bun run build
```

#### Link CLI Globally

```bash
bun link
```

Now `agentos` is available anywhere on your system.

---

## 🔑 Authentication & Model Setup

Configure your provider API keys securely using the built-in credential manager or environment variables:

```bash
# Set provider credentials (stored securely in ~/.agentos/config.json)
agentos auth set anthropic --key sk-ant-...
agentos auth set openai --key sk-...
agentos auth set gemini --key AIza...
agentos auth set deepseek --key sk-...

# Verify credential status
agentos auth status

# List all available models across providers
agentos models list

# Switch your default reasoning model
agentos models set claude-3-5-sonnet

# Test connectivity to your active provider
agentos models test
```

### Local Privacy-First Models

AgentOS natively supports local models with zero telemetry via [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai):

```bash
# Point to local Ollama instance (default: http://localhost:11434)
agentos models set ollama:qwen2.5-coder:7b

# Point to local LM Studio instance (default: http://localhost:1234/v1)
agentos models set lmstudio:local-model

# Test reachability with doctor
agentos doctor providers --probe
```

---

## 💻 Usage Modes

### 1. Interactive Terminal Console (Default)

Launch the interactive developer console in any repository:

```bash
# Launch interactive console
agentos

# Launch with an initial prompt queued
agentos "add validation for user registration email and verify tests"

# Start in Plan Mode (read-only architectural exploration)
agentos --plan "audit database query patterns"

# Resume a previous conversation session
agentos --continue
```

### 2. Desktop Application (Electron + React 19)

Launch the visual AgentOS Desktop GUI with built-in Key Vault, Visual Diff Inspector, and Workspace Explorer:

```bash
# Launch Electron desktop window
agentos desktop

# Run Desktop server in browser mode (headless server on port 3456)
agentos desktop --no-electron
```

### 3. Headless / CI Mode

Execute tasks non-interactively in automated pipelines, GitHub Actions, or shell scripts:

```bash
# Run task headlessly with automatic verification and exit codes
agentos "run test suite and fix failing assertions" --non-interactive

# Using the explicit run command with auto-commit on passing tests
agentos run --goal "upgrade dependencies and fix type errors" --auto-commit
```

### 4. Autonomous Deep Research

Perform exhaustive, multi-round technical research backed by primary sources:

```bash
# Execute deep research from the shell
agentos research "Next.js 15 Server Actions best practices and caching changes"
```

### 5. Automated Code Review

Run code review against staged changes or unified diffs with optional GitHub PR comment posting:

```bash
# Review current git diff
agentos review

# Review specific diff file and post feedback to GitHub PR
agentos review --diff ./patch.diff --pr-number 42 --post-github-comment
```

---

## ⌨️ Interactive Slash Commands

Inside the interactive terminal console, use slash commands to steer execution in real time:

| Slash Command | Action |
| :--- | :--- |
| `/help` | Display interactive help and available commands |
| `/plan` | Switch to **Plan Mode** (read-only architectural exploration; mutations disabled) |
| `/build` | Switch to **Build Mode** (active execution, edits, and test verification) |
| `/model <id>` | Hot-swap the active reasoning model on the fly |
| `/diff` | Display pending unified diffs (or press `Ctrl+D`) |
| `/todos` | Toggle interactive task checklist and milestone progress (or press `Ctrl+T`) |
| `/undo` or `/revert` | Surgically roll back file changes made during the session |
| `/snapshots` | Inspect historical shadow checkpoints and snapshot timestamps |
| `/bugfix [target]` | Run project verifier, isolate errors, and propose minimal surgical repair |
| `/research <query>` | Launch autonomous deep research with verified primary-source citations |
| `/team <workflow> <goal>` | Dispatch multi-agent team (`deep-research`, `research-and-implement`, `investigate-and-fix`) |
| `/clear` | Clear current conversation context while preserving workspace state |

---

## 📋 Complete CLI Command Reference

```text
agentos [prompt...]               Start interactive console or execute goal
agentos chat [prompt...]          Start interactive agent console
agentos run                       Run AgentOS in headless, automated, or CI mode
agentos review                    Run automated code review on diff or staged changes
agentos init                      Initialize AgentOS in current repository
agentos models                    Inspect, list, test, and switch reasoning models
agentos auth                      Manage provider API keys and credentials
agentos doctor                    Diagnose system health, providers, plugins, and MCP
agentos desktop                   Launch Electron Desktop App or browser server
agentos skills                    Manage, create, mine, and optimize agent skills
agentos agents                    Inspect and execute specialized subagents and teams
agentos research <query>          Execute autonomous deep research with citations
agentos sessions                  List, inspect, resume, and export conversation sessions
agentos service                   Manage background HTTP daemon (status, start, stop, restart)
agentos eval                      Run evaluation harness on benchmark fixtures
agentos trace                     Inspect and export execution traces
agentos patch                     Inspect, review, and save run patches
agentos config                    Inspect and manage workspace configuration
agentos trust                     Manage trusted workspaces for scripts and MCP tools
```

---

## 🏗️ Architecture

AgentOS uses a layered, truthful execution architecture where intelligence is grounded in actual repository structure:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   Developer Interfaces (apps/)                         │
│       apps/cli (Ink Terminal UI)   │   apps/desktop (Electron App)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              Agent Runtime Core (packages/agent-runtime)               │
│   AgentRuntime  •  AgentLoop  •  LightweightPlanner  •  ProjectVerifier │
│   ParallelExplorer  •  ShadowSnapshotManager  •  TeamCoordinator       │
└──────┬────────────┬─────────────┬─────────────┬────────────┬───────────┘
       │            │             │             │            │
       ▼            ▼             ▼             ▼            ▼
┌────────────┐┌───────────┐ ┌───────────┐ ┌───────────┐┌──────────────┐
│ providers  ││   tools   │ │  sandbox  │ │repository ││ patch-engine │
│ (LLM APIs) ││ (Policy)  │ │ (Worktree)│ │ (RepoMap) ││ (SHA-256)    │
└────────────┘└───────────┘ └───────────┘ └───────────┘└──────────────┘
       ▲            ▲             ▲             ▲            ▲
       └────────────┴─────────────┼─────────────┴────────────┘
                                  ▼
                   ┌─────────────────────────────┐
                   │  Append-Only Traces & Evals │
                   │    (.agentos/traces/, JSONL)│
                   └─────────────────────────────┘
```

### End-to-End Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant CLI as CLI / Desktop
    participant RT as AgentRuntime & Loop
    participant Rep as Repository (RepoMap)
    participant LLM as Model Provider
    participant Box as Sandbox (Worktree)
    participant Ver as ProjectVerifier
    participant Pat as PatchEngine

    Dev->>CLI: Goal / Task Input
    CLI->>RT: Ingest prompt & auto-discover instructions
    RT->>Rep: Extract symbol outlines & rank files (BM25 + graph)
    RT->>LLM: Stream prompt with context & safety boundaries
    LLM-->>RT: Structured tool call stream
    RT->>Box: Execute mutations in isolated Git worktree
    RT->>Ver: Discover & execute project tests (bun/npm/pytest/tsc)
    alt Tests Fail
        Ver-->>RT: Compiler & test failure output
        RT->>LLM: Feedback loop: diagnose root cause & repair
        LLM-->>RT: Repair tool calls
        RT->>Box: Apply targeted fix in sandbox
        RT->>Ver: Re-run verification
    end
    Ver-->>RT: Verification passed [OK]
    RT->>Pat: Generate unified diff with SHA-256 baseline hash
    RT->>Dev: Present approval modal with visual diff
    Dev->>RT: Approve changes
    RT->>CLI: Apply patch atomically to workspace with shadow checkpoint
```

For full deep-dive architectural specifications, component boundaries, and security policies, see [docs/architecture.md](docs/architecture.md).

---

## 🌐 Supported Model Providers

AgentOS includes built-in streaming adapters with tool-calling parity across:

| Provider | Supported Models | Config Key | Environment Variable |
| :--- | :--- | :--- | :--- |
| **Anthropic** | `claude-3-5-sonnet`, `claude-3-5-haiku`, `claude-3-opus` | `anthropic` | `ANTHROPIC_API_KEY` |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini` | `openai` | `OPENAI_API_KEY` |
| **Google Gemini** | `gemini-2.0-flash`, `gemini-1.5-pro` | `gemini` | `GEMINI_API_KEY` |
| **DeepSeek** | `deepseek-chat` (V3), `deepseek-reasoner` (R1) | `deepseek` | `DEEPSEEK_API_KEY` |
| **Ollama** | `qwen2.5-coder`, `llama3.1`, `deepseek-r1` (local) | `ollama` | None (Local HTTP) |
| **LM Studio** | Any OpenAI-compatible local model (local) | `lmstudio` | None (Local HTTP) |

For comprehensive setup details, see [docs/provider-setup.md](docs/provider-setup.md).

---

## 🔒 Safety & Permissions

AgentOS operates under four granular permission levels:

1. **`plan`**: Read-only architectural exploration. All file edits and system commands are strictly forbidden.
2. **`manual`**: Requires explicit operator confirmation for every file modification and command.
3. **`acceptEdits`**: Automatically applies verified file edits while requiring human confirmation for shell commands.
4. **`auto`**: Automatically applies file edits and safe inspection commands (`bun test`, `tsc`, `git diff`) while blocking destructive system commands.

### Defense-in-Depth Guarantees

- **Path Containment**: `WorkspaceManager` blocks relative path traversal (`../`), UNC shares, Windows device handles, and `.git/` tampering.
- **SSRF Prevention**: `read_url` blocks requests to private IPv4/IPv6 networks and cloud metadata services (`169.254.169.254`).
- **Command Security Matrix**: Over 40 built-in rules block destructive commands (`rm -rf`, `git push --force`, `git reset --hard`) and encoded execution wrappers.
- **Automated Secret Redaction**: All API keys, tokens, and private credentials are automatically stripped from execution traces before being written to disk.

For full details, see [docs/safety.md](docs/safety.md).

---

## 🧪 Evaluation Benchmark Harness

AgentOS features an automated evaluation harness in `evals/` to benchmark coding models against real, reproducible bugs:

```bash
# Run all benchmark evaluation tasks with the scripted solver
bun run eval --task all --model fake:scripted

# Run smoke test tasks
bun run eval --task smoke --model fake:scripted

# Benchmark an LLM provider on a specific bug
bun run eval --task ts-off-by-one --model anthropic:claude-3-5-sonnet

# Compare evaluation runs
bun run eval --task all --output results-v1.jsonl
bun run eval --task all --compare results-v1.jsonl
```

For more information, see [docs/evals.md](docs/evals.md).

---

## 📂 Monorepo Structure

```text
agent-os/
├── apps/
│   ├── cli/                  # Terminal interface, Commander CLI, Ink TUI, REPL
│   └── desktop/              # Electron + React 19 desktop application
├── packages/
│   ├── agent-runtime/        # AgentLoop, LightweightPlanner, ProjectVerifier, Subagents
│   ├── providers/            # LLM streaming adapters (Anthropic, OpenAI, Gemini, DeepSeek, Ollama)
│   ├── tools/                # Tool contracts, command policy engine, SSRF web reader, terminal
│   ├── sandbox/              # Git worktree isolation, process runner, shadow snapshots
│   ├── patch-engine/         # Unified diffs, SHA-256 conflict detection, atomic rollback
│   ├── repository/           # Source code intelligence, AST parsing, RepoMap ranking
│   ├── runtime-audit/        # Package boundary checker, reachability scanner, system doctor
│   ├── config/               # Hierarchical configuration loader and workspace trust manager
│   ├── sessions/             # SQLite session storage and message history
│   ├── events/               # Typed append-only event store
│   ├── metrics/              # Telemetry metrics registry and timers
│   └── shared/               # Logging event bus, JSON logger, common error hierarchies
├── evals/                    # Evaluation benchmarks, tasks, and reference fixtures
├── docs/                     # Detailed architectural, setup, and developer documentation
├── scripts/                  # Build scripts, binary compilers, Inno Setup packagers
└── archive/                  # Quarantined experimental modules preserved with revival benchmarks
```

> **Archive Policy**: Older experimental systems (such as legacy multi-agent planners or heuristic pattern engines) are quarantined in `archive/`. Code in `archive/` is never imported into the live execution path without rigorous benchmark validation proving measurable improvement. See [`archive/README.md`](archive/README.md).

---

## 🚦 Quality Gate

Before any release or pull request, the complete release gate must pass:

```bash
bun run gate
```

The release gate executes:
1. `bunx tsc --noEmit` — Monorepo-wide strict TypeScript type validation.
2. `bun test` — 911+ unit, integration, and security tests.
3. `bun run build` — Compilation of CLI distributions.
4. `bun run eval --task smoke --model fake:scripted` — End-to-end evaluation harness verification.

---

## 🤝 Contributing

We welcome contributions from developers worldwide! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for local environment setup, architecture guidelines, and pull request procedures.

---

## 🛡️ Security

To report security vulnerabilities, please refer to our [Security Policy](SECURITY.md). Please do not disclose vulnerabilities via public issues.

---

## 📄 License

AgentOS is open-source software licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Syed Najam Abbas.
