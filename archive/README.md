# AgentOS Archived Packages

This directory preserves packages that were moved out of the live execution path.
They are kept on disk so that:
- Git history, blame, and log remain useful without recovering deleted commits.
- Revival is straightforward: move back to `packages/`, re-add to workspaces, wire in.

**Do not import these packages from live code** (`apps/` or `packages/`).
**Do not delete this directory** — use git history as the source of truth for why each was deferred.

## Archive Registry

| Package | Original Purpose | Why Deferred | Revival Condition |
| :--- | :--- | :--- | :--- |
| `@agent-os/brain` | Hybrid RAG retrieval, WiCER/SEOL learning, knowledge ranking | Not imported by AgentLoop; live path uses repo_map + grep tools instead | Eval showing ≥15% task pass-rate improvement with Brain retrieval active |
| `@agent-os/context` | Structured context stack | Zero live imports; context assembled inline in AgentLoop | Eval showing context stack improves multi-turn pass rate |
| `@agent-os/memory` | Persistent session memory | Zero live imports; session state stored in SessionHistory | Multi-session eval showing memory improves continuity |
| `@agent-os/parser` | Multi-format response parser registry | Zero live imports; parsing done inline in tool implementations | Complex multi-format eval (XML, YAML, JSON5) |
| `@agent-os/metrics` | Structured metrics registry | Zero live imports; metrics emitted via EventBus | Observability benchmark requiring typed metric dimensions |
| `@agent-os/execution-engine` | Early experimental execution coordinator | Replaced by AgentLoop | Multi-step task eval where plan graph yields higher pass-rate than AgentLoop |
| `@agent-os/hardening` | Process/container security hardening | Replaced by sandbox policy engine | Security benchmark demonstrating sandbox boundary bypass resistance |
| `@agent-os/mcp` | Model Context Protocol server bridge | Not yet exposed on primary tool pipeline | External MCP tool benchmark showing improved task completion |
| `@agent-os/narrative` | Terminal UI narrative event generator | Replaced by structured event streams and Ink UI | UX eval showing narrative output improves user satisfaction |
| `@agent-os/orchestrator` | Multi-agent coordination system | Replaced by streamlined AgentLoop | Multi-agent collaboration task passing >90% on distributed goals |
| `@agent-os/pattern-intelligence` | AST/pattern query system | Merged into @agent-os/brain (also archived) | Pattern database precision benchmark |
| `@agent-os/planner` | High-level goal planning and decomposing | AgentLoop plans iteratively turn-by-turn | Eval where explicit decomposition achieves higher pass rate |
| `@agent-os/research` | Multi-step web/code research subagent | Superseded by direct agent tool use | Research-intensive eval requiring autonomous external lookup |
| `@agent-os/runtime-integration` | Legacy monolithic DI container | Replaced by modular AgentRuntime | Full-system benchmark requiring legacy RuntimeBootstrap |
| `@agent-os/seol` | Self-evolving optimization layer | Merged into @agent-os/brain (also archived) | Optimization benchmark proving caching improves latency >20% |
| `@agent-os/skills` | Static procedural skill definitions | Replaced by WorkspaceTool contracts | Complex tool orchestration eval proving skill composition superior |
| `@agent-os/subagents` | Distributed worker pool execution | Replaced by lightweight SearchSubagent | Distributed workload benchmark exceeding single-loop throughput |
| `@agent-os/trust-runtime` | Formal claim/contradiction verification | Replaced by truthful Verification.ts | Claim contradiction benchmark improving confidence scoring |
| `@agent-os/wicer` | Workspace indexing and cache engine | Replaced by BM25 repository indexer | Cache hit rate >95% on 100k+ LoC codebases |

## Archived Stubs

| Stub | Original Purpose | Why Archived | Revival Condition |
| :--- | :--- | :--- | :--- |
| `archive/stubs/providers-placeholders.ts` | Placeholder throw-stubs for Gemini/DeepSeek/Ollama | Replaced by real provider adapters in `@agent-os/providers` | Permanently superseded |
| `archive/stubs/DaemonMode.ts` | Duplicate IPC client wrapper | Replaced by `@agent-os/daemon` | Permanently superseded |

## How To Revive A Package

1. Confirm the revival benchmark condition is met (run the eval, record results).
2. `mv archive/packages/<name> packages/<name>`
3. Add `"packages/<name>"` to the root `package.json` workspaces array.
4. Run `bun install`.
5. Wire the package into the live path (add import in `runtime.ts` or relevant files).
6. Add tests proving the integration.
7. Run `bun run release:check` — must pass before merging.
8. Update this file: remove the package from the registry table.
