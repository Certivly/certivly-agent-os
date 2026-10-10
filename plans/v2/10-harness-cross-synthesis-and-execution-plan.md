# Harness Cross-Synthesis & Execution Plan (V2-10)

## 1. Executive Summary

We pulled and inspected 8 premier terminal and AI coding agent harnesses into local workspaces:
1. **Claude Code** (Anthropic) — Local clone: `.harnesses/claude-code-harness`
2. **Freebuff** (Codebuff AI) — Local clone: `.freebuff`
3. **OpenCode** (sst/opencode) — Local clone: `.opencode`
4. **Qwen Code** (Alibaba Qwen) — Local clone: `.harnesses/qwen-agent`
5. **OpenAI Codex CLI** (OpenAI) — Local clone/specs: `.harnesses/claude-code-harness/codex`
6. **OpenHands** (Formerly OpenDevin) — Local clone: `.harnesses/openhands`
7. **Aider** (Paul Gauthier) — Local clone: `.harnesses/aider`
8. **Cline** (ClineBot) — Local clone: `.harnesses/cline`

This document details the exact architectural mechanics learned from each harness, contrasts them against AgentOS, and provides an end-to-end implementation plan to integrate the best features into AgentOS.

---

## 2. In-Depth Harness Analysis & Learnings

### 1. Claude Code (Anthropic)
- **Repo Path**: `.harnesses/claude-code-harness`
- **Key Inventions**:
  - **`str_replace_editor`**: Replaces targeted code blocks through unique string matching rather than overwriting full files or dumping Markdown fences, eliminating indentation and syntax truncation issues.
  - **Stdout Micro-Summarizer**: Long bash outputs are summarized into compact semantic records before being appended to conversation history, saving tokens and preventing context blowout.
  - **Extended Thinking ReAct Loop**: Seamlessly handles `<thinking>` reasoning blocks with explicit reflection before tool dispatch.
  - **Bulletproof MCP Safety Gates**: Granular confirmation dialogs for mutating actions.

### 2. Freebuff (Codebuff AI)
- **Repo Path**: `.freebuff`
- **Key Inventions**:
  - **Model Tier Routing**: Sub-agents route cheap/exploration tasks (grep, file indexing, AST queries) to high-speed models (Gemini Flash, DeepSeek Flash) and reserve expensive frontier models (Claude 3.7 Sonnet, DeepSeek Pro) strictly for synthesis and editing.
  - **Horizontal 9-Subagent Fleet**: Specialized subagents (`librarian`, `file-explorer`, `reviewer`, `thinker`, `editor`, `browser-use`, `general-agent`, `basher`, `e2e`).
  - **Context Pruner**: Actively purges superseded tool outputs from cache once consumed.

### 3. OpenCode (sst/opencode)
- **Repo Path**: `.opencode`
- **Key Inventions**:
  - **Conductor Lifecycle Protocol**: Hard-coded task phase pipeline: `Context -> Spec -> Plan -> Implement -> Verify`.
  - **`ToolOutputStore` Managed Spillover**: Bounded tool stdout/stderr; outputs exceeding line/byte thresholds spill to temporary files and inject head/tail previews.
  - **`todowrite` Tool**: Strict JSON schema for live task state updates and plan tracking.
  - **AST Codemode**: Fast tree manipulation without full file hallucination.

### 4. Qwen Code (Alibaba Qwen)
- **Repo Path**: `.harnesses/qwen-agent`
- **Key Inventions**:
  - **3-Tier Segmented Memory Engine**:
    - `EpisodicMemory`: Tracks current session actions and turn results.
    - `LongTermMemory`: Workspace conventions, discovered documentation, project guidelines.
    - `TaskPlanMemory`: High-level goal graph and remaining subtasks.
  - **Selective Memory Retrieval**: Uses keyword + semantic ranking to feed local 7B-32B models strictly the minimal token window needed to execute actions.

### 5. OpenAI Codex CLI
- **Repo Path**: `.harnesses/claude-code-harness/codex`
- **Key Inventions**:
  - **OS-Level Micro-Sandboxing**: Replaces heavy VMs with OS primitives:
    - Linux: `Landlock` + `seccomp`
    - macOS: Apple `Seatbelt` profiles (`sandbox-exec`)
    - Windows: Low-integrity AppContainer tokens
  - **Bidirectional Schema Enforcement**: Rejects non-conforming JSON payloads immediately.

### 6. OpenHands (All-Hands-AI)
- **Repo Path**: `.harnesses/openhands`
- **Key Inventions**:
  - **Headless Background Execution Runner**: Fire-and-forget asynchronous runner for CI/CD, GitHub Actions, and PR automated fixes.
  - **Event-Stream State Architecture**: Reactive WebSocket/JSON-RPC event bus broadcasting all agent actions, diffs, and confirmations.

### 7. Aider (Paul Gauthier)
- **Repo Path**: `.harnesses/aider`
- **Key Inventions**:
  - **Architect-Editor Dual Model Mode**:
    - Architect Model: Uses high-reasoning model (o1/o3/Claude 3.7 Sonnet) to design the change and explain file touchpoints.
    - Editor Model: Uses targeted fast model with `search_replace` / `diff` prompts to write exact surgical patches.
  - **Code DNA Repo-Map**: Tree-sitter AST queries with PageRank graph centrality compressed into an exact token budget (e.g., 1024 tokens).
  - **Auto-Git Commits**: Automatically commits each successful test/edit step with an LLM-generated semantic commit message.

### 8. Cline (ClineBot)
- **Repo Path**: `.harnesses/cline`
- **Key Inventions**:
  - **Interactive Action Check-Cards**: Displays exact bash scripts, diff previews, and MCP calls with interactive Accept/Reject/Modify UI prompts.
  - **Timeline Checkpoints & Rollback**: Allows rolling back workspace files to any previous turn in the conversation.

---

## 3. Comparative Architecture Matrix

| Capability | Claude Code | Freebuff | OpenCode | Qwen Code | OpenAI Codex | OpenHands | Aider | Cline | **AgentOS (Current)** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Code Editing Precision** | `str_replace_editor` | Surgical blocks | Codemode AST | Line edits | Schema patch | Unified diff | `search_replace` | Multi-block | **`apply_patch` + `edit_file`** |
| **Sub-Agent Delegation** | Leader ReAct | 9 subagents | Conductor | Hub | Single | Subagents | Architect-Editor | Single | **`SubagentRunner` + Team** |
| **Model Routing** | Claude only | Multi-tier Flash/Pro | Agnostic | Local Qwen | OpenAI | BYOK Agnostic | Architect/Editor | BYOK Agnostic | **Model Roles + Routing** |
| **Context Thriftiness** | Micro-summaries | Pruner | Output spillover | Segmented RAG | Strict schema | Event stream | 1024 token map | Compaction | **`ToolOutputStore` + Compaction** |
| **Git & Checkpoints** | ReAct | Staging | Worktree | Basic | Git | Git | Auto-commit | Checkpoint picker | **Worktree + Shadow Git** |
| **Sandboxing** | Wrapper guards | Local | Sandbox | Local | Landlock/Seatbelt | Docker | Bare metal | UI Gating | **CommandPolicy + Sandbox** |

---

## 4. Implementation Plan for AgentOS

### Phase 1: Dual-Model Architect-Editor Pipeline (Learned from Aider + Freebuff)
- Add `ArchitectCoderEngine` in `packages/agent-runtime/src/planning/`:
  - When enabled, high-tier reasoning model (Architect) formulates specification and file diff plan.
  - Fast-tier model (Editor) consumes plan and executes precise file replacements.
  - Automatically creates a shadow commit checkpoint upon green tests.

### Phase 2: Conductor Structured Task Lifecycle (Learned from OpenCode)
- Add `ConductorPipeline` in `packages/agent-runtime/src/conductor/`:
  - Enforces 5 distinct execution phases:
    1. `Phase.CONTEXT`: Index symbols, gather relevant files.
    2. `Phase.SPEC`: Lock down target interface and constraints.
    3. `Phase.PLAN`: Generate step checklist.
    4. `Phase.IMPLEMENT`: Apply surgical changes.
    5. `Phase.VERIFY`: Run verifiers and check for clean diffs.

### Phase 3: Segmented 3-Tier Memory Store (Learned from Qwen Code)
- Add `SegmentedMemoryManager` in `packages/agent-runtime/src/memory/`:
  - Segment 1: `EpisodicMemory` (recent turn dialogue & outcomes).
  - Segment 2: `LongTermMemory` (workspace conventions, guidelines, repo patterns).
  - Segment 3: `TaskPlanMemory` (open checklist items and dependencies).

### Phase 4: Command Stdout Micro-Summarizer (Learned from Claude Code)
- Add `StdoutMicroSummarizer` in `packages/tools/src/storage/`:
  - When bash commands produce verbose build logs or test outputs (> 25 lines), synthesize a 2-3 line structured micro-summary for agent loop context, while retaining full log on disk.

### Phase 5: Verification & Test Harness Gate
- Ensure 100% test pass rate across the full suite with Zero Empty-Catch policy.
- Validate with `bun run release:check`.
