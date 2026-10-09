# Plan 04: Interactive TUI, Dual Plan/Build Modes, and Client-Server Parity

**Status:** Proposed Architecture  
**Inspired By:** Freebuff / Codebuff (Desktop & TUI 4-pane explorer), OpenCode (Plan/Build dual mode, slash command system)  
**Target Packages:** `apps/cli`, `packages/daemon`, `packages/agent-runtime`  
**Strict Directives:** Planning only — zero production code modifications.

---

## 1. Motivation & Problem Statement

Currently, `apps/cli` in AgentOS provides a single-panel chat interface using React/Ink. While functional, it has notable limitations compared to modern agents like **OpenCode** and **Freebuff**:
1. **No Clean Plan / Build Mode Separation**: In OpenCode, users can toggle between `Plan Mode` (strictly read-only tools, safe for deep exploration) and `Build Mode` (mutations allowed). In AgentOS, all tools are exposed at all times.
2. **Missing Slash Commands**: Advanced CLI agents rely on rapid slash commands (`/plan`, `/build`, `/diff`, `/compact`, `/model`, `/undo`) to control agent execution without typing verbose English prompts.
3. **No Live Diff Viewer**: Users must approve patches from raw JSON or terminal text dumps rather than seeing side-by-side or syntax-highlighted diff hunks.
4. **Monolithic Terminal Coupling**: The CLI is directly bound to the local runtime instead of functioning as a lightweight client over `packages/daemon`, preventing seamless desktop or web UI integration.

---

## 2. Architecture & UX Design

```
┌────────────────────────────────────────────────────────────────────────┐
│ AgentOS Terminal User Interface (TUI)                                   │
├───────────────────────────────────────────────────────┬────────────────┤
│ [Session: feat/auth-tokens] [Mode: PLAN] [Model: sonnet] │ FILES CHANGED  │
├───────────────────────────────────────────────────────┼────────────────┤
│ > User: Add refresh token rotation to auth middleware │ 2 files        │
│                                                       │ ├ auth.ts (+14)│
│ [AgentOS: Plan Mode]                                  │ └ jwt.ts  (+32)│
│ 1. Inspect packages/auth/src/jwt.ts                   │                │
│ 2. Add refreshTokenSchema validation                  │ [DIFF PANEL]   │
│ 3. Update verifyToken middleware to rotate tokens     │ @@ -42,6 +42,8 │
│                                                       │ + const rotate │
│ Type /build to execute this plan                      │ +   = true;    │
├───────────────────────────────────────────────────────┴────────────────┤
│ / message or slash command... (Tab: toggle mode | /diff | /compact)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Dual Operational Modes: Plan Mode vs. Build Mode

Adapted from OpenCode's proven mode separation:

### 3.1. Plan Mode (`plan`)
- **Objective**: Exploration, requirements clarification, code search, and architecture planning.
- **Tool Sandbox Restrictions**:
  - **Allowed Tools**: `read_file`, `list_dir`, `grep`, `repo_map`, `mcp` read-only tools.
  - **Blocked Tools**: `write_file`, `edit_file`, `apply_patch`, `run_command` (write commands), and any mutating MCP tools.
  - Mutating tools are **completely removed from the tool schema** sent to the LLM during Plan mode turns. This guarantees zero chance of hallucinated or premature file edits.
- **Agent Prompt**: Guided to output an actionable, numbered implementation plan with estimated file impact.

### 3.2. Build Mode (`build`)
- **Objective**: Code modification, patch application, and test verification.
- **Tool Sandbox**: Full tool suite unlocked, protected by `PermissionGuard` and `ToolPolicy`.

### 3.3. Mode Switching Interface
- **Keyboard Shortcut**: Pressing `Tab` in the input bar toggles between `PLAN` and `BUILD` mode immediately.
- **Slash Commands**: `/plan` or `/build`.

---

## 4. Slash Command System

A dedicated slash command parser inside `apps/cli/src/ui/commands/CommandDispatcher.ts`:

| Command | Arguments | Description |
| :--- | :--- | :--- |
| `/plan` | `[optional goal]` | Switches to Plan mode and generates an execution blueprint |
| `/build` | `[optional goal]` | Switches to Build mode to implement the plan |
| `/diff` | `[file]` | Opens the interactive terminal diff viewer showing pending sandbox changes |
| `/model` | `<modelId>` | Hot-switches the active reasoning model (e.g., `sonnet`, `haiku`, `deepseek-v3`, `o3-mini`) |
| `/compact` | None | Manually triggers context compaction and prunes message history |
| `/undo` | None | Reverts the last uncommitted patch bundle or git change set |
| `/review` | None | Triggers `ReviewSubagent` to re-inspect pending changes |
| `/mcp` | `list \| status` | Displays connected MCP servers and available tools |
| `/doctor` | None | Runs system diagnostics and provider connectivity tests inline |
| `/help` | None | Displays available commands and keybindings |

---

## 5. Visual Terminal Diff Viewer Component

Implemented in `apps/cli/src/ui/components/DiffPanel.tsx`:
- Parses unified diffs generated by `SandboxDiffCollector`.
- Renders additions in bright green (`+`), deletions in bright red (`-`), and header hunks in cyan (`@@`).
- Displays changed files list with per-file status badges (`MODIFIED`, `ADDED`, `DELETED`).
- Supports keyboard navigation (`j`/`k` or arrow keys) to scroll through diff hunks.

---

## 6. Client-Server Architecture Parity (Daemon Bridge)

Following OpenCode's Bun-server model and Freebuff's multi-platform architecture:
1. `packages/daemon` serves as the centralized agent engine via HTTP and WebSocket transports.
2. `apps/cli` can operate in two modes:
   - **Local Mode (Standalone)**: Runs agent loop directly in process (default for simple CLI runs).
   - **Daemon Mode (`--connect`)**: Connects to a running background daemon over Unix socket / TCP / WebSocket.
3. This architecture enables the creation of future Web or Electron Desktop clients (mirroring Freebuff Desktop) that talk to the exact same agent session.

---

## 7. Implementation Roadmap (Post-Approval)

| Step | Target File | Description |
| :--- | :--- | :--- |
| 4.1 | `apps/cli/src/ui/commands/CommandDispatcher.ts` | Implement slash command engine and argument parsing |
| 4.2 | `packages/agent-runtime/src/loop/AgentLoop.ts` | Add `executionMode: 'plan' \| 'build'` to filter tool specs |
| 4.3 | `apps/cli/src/ui/components/DiffPanel.tsx` | Implement Ink-based syntax-highlighted diff viewer |
| 4.4 | `apps/cli/src/ui/components/StatusBar.tsx` | Display active session, current mode, model, and token budget |
| 4.5 | `apps/cli/src/ui/App.tsx` | Integrate dual-mode toggle, diff panel layout, and command shortcuts |
| 4.6 | `apps/cli/tests/command-dispatcher.test.ts` | Unit tests for slash command dispatching and argument validation |
