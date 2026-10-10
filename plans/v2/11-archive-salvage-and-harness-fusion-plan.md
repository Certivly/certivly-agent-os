# Archive Salvage & Harness Fusion Implementation Plan (V2-11)

## 1. Context & Motivation

We performed a deep comparative audit of:
1. The **8 pulled open-source harnesses** (`.harnesses/aider`, `.harnesses/cline`, `.harnesses/claude-code-harness`, `.harnesses/qwen-agent`, `.harnesses/openhands`, `.freebuff`, `.opencode`).
2. Our **archived modules** in `archive/packages/` and `archive/agent-runtime-adaptive/`.

The goal is to eliminate bloat, identify the highest-value architectural patterns from our archive that match the cutting edge of these open-source harnesses, and implement them into `packages/agent-runtime` and `@agent-os/tools`.

---

## 2. Comparative Audit: Archive vs. Pulled Open-Source Harnesses

| Archive Package | Pulled Harness Equivalent | Verdict | Architectural Rationale |
| :--- | :--- | :---: | :--- |
| `archive/packages/trust-runtime` (`ContradictionDetector`, `ClaimValidator`) | **Claude Code** (Proof/Evidence Gate, Truthful Verification) | **REVIVE & FUSE** | Models frequently hallucinate "All tests passing" when exit code is 1. Fusing `ContradictionDetector` prevents false completion. |
| `archive/agent-runtime-adaptive/messaging` (`SharedBlackboard`) | **Freebuff** (Multi-agent shared blackboard & context) | **REVIVE & FUSE** | Subagents (`explorer`, `librarian`, `coder`, `verifier`) need a shared zero-overhead blackboard to pass findings without bloating prompts. |
| `archive/agent-runtime-adaptive/observation` (`FailureAnalyzer`) + `replanning` (`PlanRevisionEngine`) | **OpenCode** (Conductor self-repair loop), **OpenHands** (Failure supervisor) | **REVIVE & FUSE** | When a test or build fails, rather than looping blindly, `FailureAnalyzer` diagnoses root cause and suggests plan revisions. |
| `archive/packages/orchestrator` (`AgentConsensus`, `AgentCritique`) | **Freebuff** (Reviewer/Security precedence), **Cline** (Gated approvals) | **REVIVE & FUSE** | Enforces role precedence (`SECURITY > REVIEWER > VERIFIER > CODER`) where reviewer vetoes risky modifications. |
| `archive/packages/brain` / `wicer` | **Aider** (RepoMap), **Qwen Code** (Segmented memory) | **DO NOT REVIVE** | Superseded by modern `@agent-os/repository` AST indexer and `SegmentedMemoryStore`. |
| `archive/packages/execution-engine` | **OpenCode**, **Claude Code** | **DO NOT REVIVE** | Monolithic legacy state machine. Modern `AgentLoop` and `ConductorPipeline` are lighter and faster. |
| `archive/packages/pattern-intelligence` | **OpenCode** (AST Codemode) | **DO NOT REVIVE** | Heavy custom regex/AST compiler; superseded by modern `@agent-os/codemode`. |
| `archive/packages/runtime-integration` | N/A | **DO NOT REVIVE** | Monolithic DI container bloat; modern `AgentRuntime` is cleanly modular. |

---

## 3. High-Value Capabilities to Implement

### Capability 1: Multi-Agent Shared Blackboard (`SharedBlackboard`)
- **Origin**: `archive/agent-runtime-adaptive/messaging/SharedBlackboard.ts` + Freebuff multi-agent architecture.
- **Location**: `packages/agent-runtime/src/multiagent/SharedBlackboard.ts`
- **Features**:
  - Typed key-value memory space with namespaces (`explorer:files`, `librarian:apis`, `verifier:testResults`, `coder:patches`).
  - Read/write access across subagents during collaborative workflows.
  - Generates compact Markdown digest of blackboard contents for LLM turns.

### Capability 2: Contradiction & Claim Validation Engine (`ContradictionDetector`)
- **Origin**: `archive/packages/trust-runtime/src/contradictions/ContradictionDetector.ts` + Claude Code evidence gate.
- **Location**: `packages/agent-runtime/src/verification/ContradictionDetector.ts`
- **Features**:
  - Compares assistant completion claims against actual tool results:
    - Claim: "Tests pass" vs. Evidence: `run_command` exit code > 0 or failed tests.
    - Claim: "Modified file X" vs. Evidence: file X not present in `filesModified`.
    - Claim: "No compile errors" vs. Evidence: diagnostics report syntax/type errors.
  - Emits critical contradiction events and blocks premature loop termination.

### Capability 3: Autonomous Failure Analyzer & Plan Revision (`FailureAnalyzer`)
- **Origin**: `archive/agent-runtime-adaptive/observation/FailureAnalyzer.ts` + OpenCode Conductor.
- **Location**: `packages/agent-runtime/src/observation/FailureAnalyzer.ts`
- **Features**:
  - Inspects tool error output and failure events.
  - Categorizes root cause: `syntax_error`, `type_error`, `test_assertion_failure`, `file_not_found`, `permission_denied`, `timeout`.
  - Recommends concrete surgical actions: `revert_and_replan`, `inspect_caller`, `add_null_guard`, `check_imports`.

### Capability 4: Agent Consensus & Veto Evaluator (`AgentConsensusEvaluator`)
- **Origin**: `archive/packages/orchestrator/src/AgentConsensus.ts` + Freebuff subagent reviewer hierarchy.
- **Location**: `packages/agent-runtime/src/multiagent/AgentConsensusEvaluator.ts`
- **Features**:
  - Evaluates multi-agent execution steps with hierarchical precedence:
    `SECURITY > REVIEWER > VERIFIER > ARCHITECT > CODER`.
  - High-precedence agents (`security`, `reviewer`, `verifier`) hold veto power over code proposals.

---

## 4. Implementation Steps & Validation
1. Create `SharedBlackboard.ts` and unit tests.
2. Create `ContradictionDetector.ts` and unit tests.
3. Create `FailureAnalyzer.ts` and unit tests.
4. Create `AgentConsensusEvaluator.ts` and unit tests.
5. Export from `packages/agent-runtime/src/index.ts`.
6. Run full test suite and `bun run release:check` to ensure 100% pass rate with Zero Empty-Catch compliance.
