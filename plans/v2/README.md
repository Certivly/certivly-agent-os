# AgentOS v2 Architecture & Capability Roadmap

**Directory:** `plans/v2/`  
**Date:** 2026-10-09  
**Status:** Architecture Complete & Implementation Plans Ready  
**Benchmarked State-of-the-Art Systems:**
- **Freebuff / Codebuff** (`CodebuffAI/freebuff`, `.freebuff/`): Autonomous Subagents, Context Pruning, Best-of-N Thinkers, Tmux PTY, External Librarian, Browser-Use.
- **OpenCode** (`anomalyco/opencode`, `.opencode/`): CodeMode Programmatic Tool Orchestration, Content-Addressed Shadow Git Snapshots, Context Epochs.

---

## 1. Executive Vision: Next-Generation Agent Capabilities

While **v1** established robust multi-agent primitives, MCP tool bridges, zero-token mechanical compaction, and prefix-stable caching, **AgentOS v2** elevates the harness into an autonomous, high-leverage software engineering operating system.

v2 addresses the four fundamental friction points of modern coding agents:
1. **Tool Execution Roundtrip Latency**: LLMs spend 10–20 separate turns executing sequential/looping tool calls. **CodeMode** replaces multi-turn chatter with a single sandboxed JavaScript orchestration script.
2. **Context Window Degradation**: Long conversations fill up with massive raw tool dumps from subagents. The **Autonomous Context Pruner** aggressively scrubs intermediate subagent logs and optimizes for provider cache TTLs.
3. **Interactive & State-Dependent Workflows**: Agents fail on interactive CLI prompts, database shells, and long-running dev servers. The **Persistent Terminal Multiplexer** provides full PTY session management with idle detection.
4. **Hard Algorithmic & Architectural Challenges**: Complex bugs cause agents to thrash on single hypotheses. The **Best-of-N Thinker & Judge** framework explores parallel reasoning branches and selects the optimal path before touching files.

---

## 2. Plan Document Index

| Document | Feature | Source Benchmark | Key Architectural Deliverable |
| :--- | :--- | :--- | :--- |
| [01-codemode-programmatic-tools.md](file:///d:/Work/Personal/Cli/agent-os/plans/v2/01-codemode-programmatic-tools.md) | **CodeMode Programmatic Tool Orchestration** | OpenCode (`packages/codemode`) | Confined JS runtime where model writes scripts to sequence tools, filter intermediate data, and execute concurrent operations with zero LLM roundtrips. |
| [02-context-pruner-and-cache-expiry.md](file:///d:/Work/Personal/Cli/agent-os/plans/v2/02-context-pruner-and-cache-expiry.md) | **Autonomous Context Pruner & TTL Optimizer** | Freebuff (`agents/context-pruner.ts`) | Subagent log scrubbing, asymmetric user/assistant token budgeting, and cache-expiry (5-min TTL) heuristic compaction. |
| [03-persistent-terminal-multiplexer.md](file:///d:/Work/Personal/Cli/agent-os/plans/v2/03-persistent-terminal-multiplexer.md) | **Persistent Terminal Multiplexer (PTY)** | Freebuff (`agents/tmux-cli.ts`) | Interactive terminal sessions (repl, watchers, shells) with send/wait-idle/capture primitives and screen-buffer diffing. |
| [04-best-of-n-thinking-and-judge.md](file:///d:/Work/Personal/Cli/agent-os/plans/v2/04-best-of-n-thinking-and-judge.md) | **Best-of-N Trajectory Thinking & Judge** | Freebuff (`agents/thinker/best-of-n/`) | Parallel thought generation (`GENERATE_N`), multi-hypothesis evaluation, and dedicated Judge/Selector model evaluation. |
| [05-external-repo-librarian.md](file:///d:/Work/Personal/Cli/agent-os/plans/v2/05-external-repo-librarian.md) | **External Repository Librarian Subagent** | Freebuff (`agents/librarian/`) | Sandboxed shallow git cloning of third-party repositories to inspect APIs, documentation, and reference code without polluting workspace. |
| [06-shadow-git-checkpoints-and-rollback.md](file:///d:/Work/Personal/Cli/agent-os/plans/v2/06-shadow-git-checkpoints-and-rollback.md) | **Shadow Git Checkpoints & Surgical Rollback** | OpenCode (`packages/core/src/snapshot.ts`) | Content-addressed git trees in isolated shadow directories for turn-by-turn undo and diff inspection without wiping uncommitted user work. |
| [07-browser-devtool-agent.md](file:///d:/Work/Personal/Cli/agent-os/plans/v2/07-browser-devtool-agent.md) | **Browser DevTools Verification Subagent** | Freebuff (`agents/browser-use/`) | Headless Chrome DevTools Protocol subagent for live UI verification, layout testing, and console error detection. |
| [08-skills-system-and-auto-optimizer.md](file:///d:/Work/Personal/Cli/agent-os/plans/v2/08-skills-system-and-auto-optimizer.md) | **Skills System & Closed-Loop Auto-Optimizer** | Microsoft SkillOpt (`SkillOpt`) & Skill-Optimizer (`skill-miner`) | Reusable `SKILL.md` library, offline session trace mining (`SkillMiner`), and closed-loop textual optimization with eval regression gates (`SkillOptimizer`). |

---

## 3. Implementation Phasing Strategy

```mermaid
flowchart TD
    subgraph Phase 1: Execution & Tooling Revolution
        P1A["01: CodeMode Programmatic Tools"] --> P1B["03: Persistent Terminal PTY"]
    end

    subgraph Phase 2: Token Economics & Safety
        P2A["02: Context Pruner & TTL"] --> P2B["06: Shadow Git Snapshots"]
    end

    subgraph Phase 3: High-Reasoning & Verification Subagents
        P3A["04: Best-of-N Thinker"] --> P3B["05: External Librarian"]
        P3B --> P3C["07: Browser DevTools Agent"]
    end

    Phase 1 --> Phase 2 --> Phase 3
```

- **Phase 1 (Execution Acceleration)**: Deliver CodeMode and Persistent PTY Multiplexer.
- **Phase 2 (Resilience & State Safety)**: Deliver Subagent Context Pruning and Shadow Git Snapshots.
- **Phase 3 (Deep Intelligence & Verification)**: Deliver Best-of-N Thinker, Librarian, and Browser-Use Subagents.

---

## 4. Architectural Cohesion Matrix

| Subsystem | Target AgentOS Package | Integration Touchpoints |
|---|---|---|
| **CodeMode Engine** | `packages/codemode` (new package) | Registered as dynamic `execute` tool in `ToolRegistry`; bridges tools to JS sandboxed runtime. |
| **Context Pruner** | `packages/agent-runtime/src/compaction/` | Hooked into `AgentLoop` turn boundary; prunes completed subagent tool results. |
| **Terminal Multiplexer** | `packages/sandbox/src/terminal/` | Provides persistent PTY sessions via node-pty / tmux wrapper; exposes `terminal_send` and `terminal_capture`. |
| **Best-of-N Thinker** | `packages/agent-runtime/src/planning/` | Invoked by `LightweightPlanner` or model on high-complexity tasks; aggregates parallel model completions. |
| **External Librarian** | `packages/agent-runtime/src/exploration/` | Spawns sandboxed git clone in `~/.agentos/clones/`; indexes code via Tree-sitter / grep. |
| **Shadow Git Snapshots** | `packages/sandbox/src/snapshot/` | Hooked into pre-tool execution in `AgentLoop`; stores tree hashes in SQLite. |
| **Browser DevTools Agent** | `packages/agent-runtime/src/verification/` | Puppeteer / CDP client invoked by `ProjectVerifier` for web projects. |
