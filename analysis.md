# AgentOS — Codebase Analysis & V1 Roadmap

## What Is This?

**AgentOS** is an **Autonomous Agent Runtime** — a self-contained operating system layer for AI coding agents that aims to be a direct competitor to Claude Code, OpenCode, Aider, and Cline.

The core thesis: most AI coding agents are shallow wrappers around `LLM → Tool Call → Response`. AgentOS replaces this with a **deeply structured, deterministic, evidence-driven execution pipeline** where every decision is grounded in real codebase analysis — not LLM hallucination.

The primary deployment target is a **CLI** (`agentos`), built on Bun + TypeScript, organized as a monorepo with 32 packages.

---

## What Has Been Built (Completed)

The monorepo has achieved an extraordinarily deep infrastructure foundation across ~13 major phases:

### Core Infrastructure ✅
| Package | Role |
|---|---|
| `shared` | Logger, EventBus, error types, async context |
| `events` | Append-only `EventStore` — the system's source of truth |
| `metrics` | `MetricRegistry` for all internal counters |
| `sessions` | Per-session SQLite message + tool call storage |
| `config` | `ConfigManager` — multi-provider YAML config |

### Intelligence Layers ✅
| Package | Role |
|---|---|
| `repository` | `RepositoryIndexer` — walks the workspace, builds a File/Symbol/Dependency graph |
| `wicer` | **W**orkspace **I**ntelligence **C**ode **E**xplanation **R**easoner — generates verified knowledge units from the repo graph |
| `parser` | Multi-language deterministic structural compiler (Tree-sitter) |
| `brain` / `brain-v2` | `RepositoryBrain` — retrieval, ranking, context assembly, learning feedback |
| `pattern-intelligence` | Detects architectural patterns from the graph (folder conventions, service patterns, test styles, validation libraries, naming) WITHOUT LLM |
| `memory` | Persistent memory store with lineage tracking |
| `context` | `ContextStack` — manages in-session context with eviction policy |
| `narrative` | Execution narrative / explainability layer |

### Agent Orchestration ✅
| Package | Role |
|---|---|
| `planner` | `Planner` → `GoalAnalyzer` → `PlanBuilder` → `TaskGraph` — converts user goals into `ExecutionPlan` DAGs |
| `orchestrator` | `AgentCoordinator` with typed agents (Architect, Coder, Tester, Reviewer, Security, Docs), consensus engine, critique system, replay |
| `subagents` | Sub-agent runtime primitives |
| `skills` | `SkillRegistry` — pluggable task execution units |
| `seol` | Skill Execution Optimization Layer — adaptive skill performance |

### Safety & Execution ✅
| Package | Role |
|---|---|
| `sandbox` | `SandboxManager` — git worktree isolation + local execution + validation |
| `execution-engine` | `PlanExecutor`, `TaskDispatcher`, `TaskScheduler`, retry/failure/approval coordination |
| `trust-runtime` | `TrustEngine` — claim verification, contradiction detection, trust scoring, regression detection |
| `patch-engine` | `PatchEngine` — AST patch generation, validation, rollback, lineage tracking |
| `mcp` | Governed MCP federation — ALLOW/ASK/DENY policy engine for external tools |
| `hardening` | Runtime hardening layer |

### Runtime Assembly ✅
| Package | Role |
|---|---|
| `runtime-integration` | `RuntimeBootstrap` (IoC container) + `RuntimePipeline` (8-stage execution sequence) |
| `agent-runtime` | `AgentRuntime` — thin request loop, delegates all intelligence to `RuntimePipeline` |
| `providers` | Provider interface + working OpenAI adapter; placeholder adapters for Anthropic, Gemini, DeepSeek, OpenRouter, Ollama |
| `runtime-audit` | Self-auditing system — detects dead/stubbed/disconnected packages, produces reachability/dependency/ownership reports |

### Applications ✅
| App | Role |
|---|---|
| `apps/cli` | `CliRuntime` + Ink-based TUI + `CommandRouter`, `chat`, `doctor`, `runtime-audit`, `dead-packages`, `runtime-graph`, `wiring-report` commands |

---

## The Fundamental Problem Right Now

The codebase has the **architectural shape of a full autonomous agent system**, but the packages are **not yet functionally wired together in production**.

The `RuntimePipeline.execute()` does call into all 8 stages (Repository → WiCER → PatternIntel → Planner → Orchestrator → ExecutionEngine → TrustRuntime → PatchEngine), but:

1. **The pipeline calls are facade-level** — `patternEngine.scan({ nodes: [], edges: [] }, [], "latest")` passes empty graphs. The real graph produced by `repository.index()` is never fed downstream.
2. **Providers are mostly placeholders** — Anthropic, Gemini, DeepSeek, OpenRouter, Ollama all throw `ProviderError("... is a placeholder and not implemented yet")`. Only OpenAI works.
3. **The context pipeline is missing** — The `context` package exists and has a `ContextStack`, but it is never invoked in the request path. The LLM receives raw conversation history, not the enriched context assembled from memory + WiCER + repo graph.
4. **Skills are never invoked from the pipeline** — `ExecutionEngine.executePlan()` exists, but no skill is actually dispatched as part of a real plan step.
5. **`brain` and `brain-v2` are disconnected** — `RepositoryBrain` is a well-designed retrieval system but is not wired into the request pipeline.
6. **Several packages are dead** — `adaptive-runtime`, `brain`, `brain-v2`, `daemon`, `hardening`, `narrative`, `subagents`, and others are built but not reachable from `apps/cli` in production.

This is what the docs call the **"Excellent components, No assembled system"** problem. The system currently behaves like a **Chat Runtime + Tool Calling** wrapper, not an Autonomous Agent Runtime.

---

## Where V1 Needs to Go

Based on the architecture docs and current gaps, here is the remaining V1 work, ordered by priority:

### 🔴 Critical (Blocking V1 Usefulness)

#### 1. Real Pipeline Data Flow (Phase 10.8 — In Progress, Incomplete)
The `RuntimePipeline` stages must pass **live data** between each other:
- `repository.index(cwd)` → produces a real `RepositoryGraphSnapshot`
- That graph flows to `wicer.compile(graph)` → produces real `KnowledgeUnits`
- Those units flow to `patternEngine.scan(graph, knowledgeUnits)` → produces real `PatternSnapshot`
- All of the above flow to `planner.createPlan({ goal, graph, patterns, knowledge, memory })`
- Plan flows to `orchestrator.coordinate(plan)` → real agent consensus
- Result feeds `executionEngine.executePlan(plan)` → actual skill dispatch

#### 2. Context Engineering (Phase 11 — Not Started)
The `context` package exists but the **context assembly pipeline** is missing end-to-end. Before every LLM call, the system must assemble:
```
User Prompt → Brain → Memory → WiCER → Repository Graph → Trust History → Relevant Files → LLM
```
This is described as "the secret sauce" — without it, every LLM call is essentially blind.

#### 3. Provider Implementations (Phase 10 — Partial)
Only OpenAI works. Anthropic, Gemini, DeepSeek, OpenRouter, Ollama are placeholder stubs. For V1, at minimum **Anthropic (Claude)** and **Gemini** should be real implementations since those are the primary competitor models.

#### 4. Skill Routing (Phase 10.8 — Not Started)
The `SkillRegistry` exists but no skills are registered by default, and the `PlanExecutor → TaskDispatcher → SkillExecutor` chain is never invoked from a real plan step. The planner must produce plans whose steps select real skills, and the execution engine must invoke them.

### 🟡 Important (V1 Quality)

#### 5. Human Approval Workflow (Phase 13)
The `PatchEngine` produces a `PatchBundle` and `TrustEngine` produces a trust score — but the CLI has no UX to display this, let the user review the diff, and approve/reject. This is the "human in the loop" gate that makes the system safe to use in production repos.

#### 6. Decision Provenance (Phase 10.10 — Not Started)
Every plan decision, skill selection, and patch must carry evidence of *why* it was made. `PlanningEvidence`, `SkillSelectionReason`, `PatchEvidence` structs need to be attached to every step. This feeds the `agentos explain-last-run` command and proves the intelligence layers are actually influencing outcomes.

#### 7. `brain` / `brain-v2` Integration
`RepositoryBrain` is a complete retrieval system (query classify → plan → retrieve → score → rank → assemble context) but is completely disconnected. It should be the intelligence core driving context assembly.

### 🟢 V1 Completeness

#### 8. `narrative` Package Activation
Exists but unused. Should produce post-execution narratives: what happened, why, what changed, what failed.

#### 9. Daemon Mode (Phase 8.3)
`daemon` package exists but appears disconnected. For persistent background indexing and watching, `RepositoryWatcher` from the `repository` package needs to run continuously.

#### 10. IDE Integration (Phase 12)
VS Code extension — this is how daily users will interact. Out of scope for initial CLI V1, but critical for adoption.

---

## Current Architecture Reality vs. Target

```
CURRENT (what actually runs):
CliRuntime → AgentRuntime → providers/OpenAI → tool calls → response

TARGET V1:
CliRuntime → AgentRuntime → RuntimePipeline:
  [1] RepositoryIndexer     → RepositoryGraphSnapshot
  [2] WiCER                 → KnowledgeUnits
  [3] PatternIntelligence   → PatternSnapshot
  [4] Planner               → ExecutionPlan (DAG)
  [5] AgentCoordinator      → AgentConsensus + Workflow
  [6] ExecutionEngine       → SkillDispatch + SandboxExecution
  [7] TrustRuntime          → TrustScore + RegressionCheck
  [8] PatchEngine           → PatchBundle
  [9] Context Assembly      → Enriched LLM prompt per step
  [→] Human Approval UI     → diff review + accept/reject
```

---

## Honest V1 Scope

> [!IMPORTANT]
> The documentation itself (phases.md) identifies exactly 6 phases remaining for a "genuinely competitive v1":
> - **8.9** Patch Engine ✅ (built, needs wiring)
> - **9.0** Sandbox Runtime ✅ (built, needs verification loops)
> - **10.0** Provider Runtime 🔶 (OpenAI done, others are stubs)
> - **11.0** Context Engineering 🔴 (not started)
> - **12.0** IDE Integration 🔴 (not started)
> - **13.0** Approval Workflow 🔴 (not started)

The most important realization: **the infrastructure is extraordinary — it just hasn't been assembled into a working system yet.** The next work is not building more packages; it's connecting the ones that exist.

> [!TIP]
> The fastest path to a working V1 demo is: fix the `RuntimePipeline` data flow (real graph passed between all stages) + implement context assembly + add the approval UX. That alone would make AgentOS demonstrably superior to naive LLM tool-call agents.

---

## What Makes AgentOS Differentiated

1. **Graph-grounded, not hallucination-grounded** — All intelligence is derived from the actual codebase graph, not LLM inference
2. **Pattern Intelligence** — Detects existing architectural patterns before generating code, so new code doesn't violate the project's existing style
3. **Trust Runtime** — Every action has a risk score; every patch must carry evidence before it's accepted
4. **Event Sourcing** — Complete, replayable audit trail of every execution step
5. **Governed MCP** — External tools cannot inject themselves; they go through a policy engine
6. **Human approval gate** — The agent proposes, the human approves, then the patch applies

These are genuine architectural advantages that Claude Code, Cline, and Aider do not have.
