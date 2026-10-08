# AgentOS Experiment Roadmap

This document outlines the strategic evolution, experimentation protocol, proven capabilities, and future research queue for AgentOS.

---

## 1. Current Live Architecture

AgentOS operates on a single-agent, layered truthful execution path:

```text
CLI (apps/cli)
 └──> AgentRuntime (packages/agent-runtime)
       └──> AgentLoop
             ├──> Providers (packages/providers: OpenAI, Anthropic, Ollama, LM Studio)
             ├──> Tools (packages/tools: workspace sandboxed operations, command policy)
             ├──> Sandbox (packages/sandbox: isolated git worktrees, process isolation)
             ├──> Verification (packages/agent-runtime: automated feedback & repair)
             ├──> Planning (packages/agent-runtime: lightweight, reactive step tracker)
             └──> Patch Engine (packages/patch-engine: unified diffs, SHA-256 pre-images)
```

The production loop prioritizes **truthful verification over blind generation**, isolating all filesystem modifications within temporary worktrees until human approval or verification sign-off.

---

## 2. What Is Intentionally Not in the Live Path

To maintain high throughput, low latency, and zero flaky states, the following concepts are **intentionally excluded** from the live execution path:

- **Autonomous Background Subagent Swarms**: Multi-agent conversational handoffs create unpredictable nondeterminism and high token bloat without measurable benchmark improvements.
- **Hierarchical Heavy Planners**: Deep upfront task graphs fail immediately upon encountering dynamic compiler errors; lightweight reactive planning is used instead.
- **Unverified In-Memory Pattern Extrapolations**: Storing speculative semantic patterns without verification success degrades prompt signal-to-noise.
- **Direct Workspace Mutation Prior to Approval**: The agent never edits live repository files directly; all mutations occur in isolated sandboxes.

---

## 3. Experiment Protocol & Rules

Any architectural change, provider adapter, or prompt enhancement must follow our strict experimentation protocol:

1. **Isolation Behind Feature Flags**: All candidate modifications must be toggleable via environment variable, CLI flag, or runtime option.
2. **Authoritative Benchmark Validation**: Every experiment must run against the baseline eval suite:
   ```bash
   bun run eval --task all --model fake:scripted
   ```
3. **Zero Regression Gate**: A candidate is rejected immediately if it regresses pass rate on established benchmark tasks.
4. **Efficiency Budget Check**: Latency or token increases must be accompanied by proportional pass-rate gains. Run `agent bench --check` to ensure budgets are preserved.
5. **Clean Rollback**: If an experiment fails to prove value, the flag and associated code branches must be cleanable within one commit.

---

## 4. Proven Features

The following capabilities have been validated through benchmarks and are enabled in the live path:

- **Truthful Test Verification**: Discovering and running `bun test`, `npm test`, `pytest`, `tsc` inside the sandbox with automated error recovery.
- **Streaming Tool Call Parity**: Unified incremental streaming across OpenAI, Anthropic, Ollama, and LM Studio.
- **Atomic Pre-Image Patch Engine**: SHA-256 validation preventing patch drift or clobbering external modifications.
- **Secret Redaction**: Automated scrubbing of API keys, bearer tokens, and private credentials from execution traces.
- **Local Model Diagnostics (`agent doctor`)**: Live reachability and tool-readiness probes for local LLM engines.
- **Lightweight Reactive Planning**: Triggered dynamically by multi-file edits or verification failures.

---

## 5. Promising but Unproven Features

The following features are queued for hypothesis testing:

| Feature | Target Area | Hypothesis |
| :--- | :--- | :--- |
| **Embeddings + BM25 Hybrid Retrieval** | `packages/repository` | Combining vector embeddings with lexical BM25 will improve target file ranking on large 10k+ file codebases. |
| **Long-Term Repo Memory Beyond Verified Workflows** | `packages/memory` | Caching architectural conventions across sessions will reduce exploration turns on repeated queries. |
| **Multi-Agent Speculative Reviewer** | `packages/agent-runtime` | A specialized critic model reviewing unified diffs can catch edge-case bugs before test execution. |
| **Automatic Branch & PR Creation** | `apps/cli` | Automated creation of git branches and GitHub PR drafts upon patch acceptance. |
| **Background Indexing Daemon** | `packages/repository` | Maintaining in-memory AST indices in a background service eliminates initial cold-start index latency. |
| **UI Timeline Replay** | `apps/cli` | Visual terminal timeline allowing developers to step backward and forward through turn events. |
| **Semantic Patching with Tree-Sitter** | `packages/patch-engine` | AST-aware node replacements can avoid whitespace/formatting conflicts in unified diffs. |
| **Learned Command Selection** | `packages/agent-runtime` | Prioritizing targeted test subcommands over full repo test runs will shorten verification cycles. |
| **Task-Specific Subagents** | `packages/agent-runtime` | Specialized subagents for narrow tasks (e.g. migration, test generation) invoked synchronously. |

---

## 6. Rejected or Deferred Ideas

The following concepts were evaluated and deferred until evals justify their cost and complexity:

- **Old Orchestrator (`archive/orchestrator`)**: Overhead exceeded single-agent performance by 3.4x in latency.
- **Old Heavy Planner (`archive/planner`)**: High token burn rate with brittle plan execution on compiler feedback.
- **WiCER / SEOL (`archive/wicer`, `archive/seol`)**: Complex graph context extraction superseded by compact `RepoMap`.
- **Pattern Intelligence (`archive/pattern-intelligence`)**: Generated noisy unverified hints that degraded small model adherence.
- **Narrative Log Generation (`archive/narrative`)**: Expensive summarization turns redundant with JSONL run traces.
- **Generic Unconstrained Subagents**: Drastic increase in hallucinated tool calls and infinite agent loops.

---

## 7. Archived Package Revival Policy

Code residing in `archive/` is strictly isolated from active imports:

1. **Benchmark Prerequisite**: No archived package may be reintroduced without a reproduction harness demonstrating a +10% improvement in task success over current `AgentLoop`.
2. **De-coupling**: Features revived from archive must be rewritten against current clean interfaces (`@agent-os/tools`, `@agent-os/providers`, `@agent-os/sandbox`).
3. **No Zombie Modules**: Partial revivals that bring unmaintained dependencies or circular imports will be rejected during `release:check`.

---

## 8. Experiment Template

Use the following template for all RFCs and experimental pull requests:

```text
Title: [Short descriptive title]
Hypothesis: [What specific metric improves, why, and by how much?]
Feature flag: [AGENTOS_EXP_<NAME> or CLI option]
Eval tasks affected: [List of task IDs or 'all']
Baseline:
  - Pass Rate: X%
  - Avg Wall Time: Ys
  - Avg Tokens: Z
Candidate:
  - Pass Rate: X%
  - Avg Wall Time: Ys
  - Avg Tokens: Z
Decision: [Accept | Reject | Defer]
Rollback: [Git commit hash or instructions to cleanly remove flag]
```
