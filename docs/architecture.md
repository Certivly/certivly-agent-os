# AgentOS Architecture

This document describes the architectural principles, live execution path, package responsibilities, and runtime subsystems of AgentOS.

---

## 1. Live Path Architecture

AgentOS uses a single-agent layered execution loop designed for transparency, safety, and verifiable outcomes:

```text
┌────────────────────────────────────────────────────────┐
│                        apps/cli                        │
│         (Interactive CLI, Commands, Ink Views)         │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               packages/agent-runtime                   │
│        (AgentRuntime, AgentLoop, Planning)             │
└──────┬────────────┬─────────────┬─────────────┬────────┘
       │            │             │             │
       ▼            ▼             ▼             ▼
┌────────────┐┌───────────┐ ┌───────────┐ ┌──────────────┐
│  providers ││   tools   │ │  sandbox  │ │ patch-engine │
│  (LLM APIs)││ (Fs/Cmds) │ │ (Worktree)│ │ (Atomic Diff)│
└────────────┘└───────────┘ └───────────┘ └──────────────┘
       ▲            ▲             ▲             ▲
       └────────────┴──────┬──────┴─────────────┘
                           │
             ┌─────────────┴─────────────┐
             │  Tracing, Evals & Memory  │
             │   (.agentos/traces, JSONL)│
             └───────────────────────────┘
```

### Execution Flow

1. **User Input / Task Trigger**: The CLI invokes `AgentRuntime.run()` or `runInteractive()`.
2. **Context Assembly**: `RepoMap` extracts symbol outlines, ranking files via BM25, graph centrality, test affinity, and recency. Speculative analysis (`ParallelExplorer`) extracts candidate files and potential risks.
3. **Planning**: If complexity triggers fire (multi-file prompt, many candidate files, prior verification failures), `LightweightPlanner` generates or updates an actionable step-by-step plan.
4. **Agent Loop (`AgentLoop`)**:
   - Assembles system prompt with safety boundaries, workflow memory hints, and active tool definitions.
   - Dispatches prompt to model provider (streaming tool call parity across OpenAI, Anthropic, Ollama, LM Studio, FakeScripted).
   - Validates tool invocations against security policies (`WorkspaceManager`, `policy.ts`).
   - Executes filesystem edits in an isolated Git worktree (`Sandbox`).
5. **Truthful Verification**:
   - `ProjectVerifier` automatically discovers project verification commands (`typecheck`, `test`, `lint`, `build`).
   - Executes tests inside the sandbox. If verification fails, feedback is routed back to the LLM for automated repair (up to retry limit).
6. **Self-Review Pass**:
   - Optional final sanity check inspecting unified diffs for unintended regressions or residual debugging artifacts.
7. **Patch Engine & Approval**:
   - `ChangeSetStore` generates SHA-256 validated atomic unified diffs.
   - High-risk changes trigger interactive approval modal (`ApprovalView`).
   - Rollback is guaranteed to restore bit-for-bit workspace contents.
8. **Observability**:
   - Every event is recorded to `.agentos/traces/<runId>.jsonl` with automatic credential redaction.

---

## 2. Package Ownership & Responsibilities

| Package | Ownership & Scope |
| :--- | :--- |
| `apps/cli` | CLI command entrypoints (`agent run`, `agent eval`, `agent trace`, `agent bench`, `agent doctor`), Ink terminal components, interactive approval screens. |
| `packages/agent-runtime` | `AgentLoop`, `AgentRuntime`, execution lifecycle, `LightweightPlanner`, `ProjectVerifier`, `ParallelExplorer`, `RunTracer`, event subscriptions. |
| `packages/providers` | Unified model interfaces (`BaseModel`, `OpenAIModel`, `AnthropicModel`, `GeminiModel`, `DeepSeekModel`, `OllamaModel`, `LMStudioModel`, `FakeScriptedModel`), streaming tool parser, cost calculation. Supported live adapters: `openai`, `anthropic`, `gemini`, `deepseek`, `lmstudio`, and `ollama` (`openrouter` remains a future adapter). |
| `packages/tools` | System & workspace tools (`read_file`, `write_file`, `edit_file`, `patch_file`, `run_command`, `list_dir`, `grep_files`), command approval policies, path sandboxing. |
| `packages/sandbox` | Worktree and temporary directory lifecycle management, process isolation, environment variable sanitization. |
| `packages/patch-engine` | Unified diff generation, SHA-256 pre-image conflict detection, patch application, and atomic rollback. |
| `packages/repository` | Source code intelligence, AST parsing, AST symbol extraction, `RepoMap` generation, graph centrality ranking. |
| `packages/evals` | Automated evaluation harness, task runner, benchmark comparisons, regression gates. |

---

## 3. Archived Packages & Isolation Policy

Older experimental systems have been retired to `archive/` to keep the live execution path clean, maintainable, and deterministic:

- `archive/orchestrator`: Retired multi-agent orchestrator superseded by unified `AgentLoop`.
- `archive/planner`: Over-engineered hierarchical planner replaced by reactive `LightweightPlanner`.
- `archive/wicer`, `archive/seol`: Experimental context engines consolidated into `packages/repository`.
- `archive/pattern-intelligence`: Experimental rule-mining engine consolidated into `packages/memory`.

> **Policy**: Code in `archive/` is never imported into the live execution path. Any feature revival from `archive/` requires a rigorous evaluation experiment proving measurable improvement on eval benchmarks.

---

## 4. Deferred Components

All deferred packages are preserved in `archive/`. See [`archive/README.md`](../archive/README.md)
for the full registry with revival conditions.

**Why archive instead of delete?**
Archived packages retain full git history context, allow straightforward revival via
a directory move, and document the exact eval benchmark needed to justify reintegration.
The archive is a **backlog**, not a graveyard.

### Live Path (as of Actions 4 + 5)

```text
CLI (apps/cli)
  → AgentRuntime
    → LightweightPlanner (pipeline: explore→edit→verify→patch→approve)
    → AgentLoop
      → PermissionGuard (plan / manual / acceptEdits / auto)
      → SearchSubagent (read-only, capped at 5 turns)
      → ToolRegistry: read_file, grep, list_dir, edit_file, write_file,
                      apply_patch, run_command, repo_map
      → SandboxManager / WorktreeSession
      → SandboxDiffCollector
      → ProjectVerifier (max 3 repair turns)
      → ChangeSetStore
      → ApprovalGate (typed ChangeSetId)
      → HookRunner (lifecycle hooks)
    → EventBus
```

---

## 5. Traces and Evals Overview

- **Run Traces (`.agentos/traces/`)**: Append-only JSONL files capturing all model inputs, tool calls, tool results, verification runs, and token consumption. Secrets (API keys, tokens, basic auth credentials) are automatically stripped before storage.
- **Evaluation Harness (`evals/`)**: Standalone benchmark suite containing reproducible coding bug tasks (`ts-off-by-one`, `ts-null-handling`, `ts-wrong-comparison`, etc.). Run with `agent eval --task all --model fake:scripted`.

