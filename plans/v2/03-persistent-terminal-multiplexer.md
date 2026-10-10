# Plan 03: Persistent Interactive Terminal Multiplexer (PTY)

**Document:** `plans/v2/03-persistent-terminal-multiplexer.md`  
**Date:** 2026-10-09  
**Status:** Implementation Specification  
**Benchmark Source:** Freebuff (`agents/tmux-cli.ts`)

---

## 1. Problem Statement & Motivation

AgentOS currently relies on one-shot command execution via `run_command` (`spawn` with process timeout). This breaks on standard engineering workflows:
1. **Interactive CLIs**: CLI prompts requiring input (`npm init`, `git add -p`, `psql`, `python REPL`) hang until timeout because stdin is closed or non-interactive.
2. **Long-Running Dev Servers**: Running `npm run dev` or `vite` blocks the agent loop forever unless killed, making it impossible to keep a server alive while editing files and testing endpoints.
3. **Terminal Cursor / ANSI Escapes**: Full-screen terminal applications (e.g. `htop`, curses, interactive test runners) produce unreadable ANSI escape codes when captured as raw stdout streams.

---

## 2. Freebuff Architecture Pattern (`tmux-cli.ts`)

Freebuff introduces a **Persistent Terminal Multiplexer** architecture:
- Allocates an isolated pseudo-terminal (PTY) session per task (named `tmux-session-<id>`).
- Provides three core terminal primitives:
  1. `terminal_send(session, text, keys)`: Types into the terminal or sends control keys (`C-c`, `Enter`, `Tab`, `Escape`).
  2. `terminal_wait_idle(session, timeoutMs, idleMs)`: Monitors output stream; resolves when no new output has been printed for `idleMs` (e.g. prompt has returned).
  3. `terminal_capture(session, lines)`: Dumps the rendered visual screen buffer (clean text stripped of ANSI control sequences) to a capture file.
- Provides automatic session lifecycle management and cleanup when the run completes.

---

## 3. AgentOS Engineering Specification

### 3.1. Subsystem Architecture: `packages/sandbox/src/terminal/`

On Unix, uses `tmux` or `node-pty`. On Windows, uses Windows Pseudoconsole (`ConPTY`) via `node-pty`:

```
packages/sandbox/src/terminal/
├── TerminalSessionManager.ts       # Registry of active terminal sessions
├── PtyProcess.ts                   # ConPTY / node-pty wrapper
├── ScreenBuffer.ts                 # VT100 / xterm screen emulator (clean text capture)
├── IdleDetector.ts                 # Debounced stream idle monitor
└── types.ts                        # Session configuration & capture schemas
```

### 3.2. Core Interfaces

```typescript
export interface TerminalSessionConfig {
  id: string;
  cwd: string;
  env?: Record<string, string>;
  cols?: number;                     // Default: 120
  rows?: number;                     // Default: 40
}

export interface TerminalCapture {
  screenText: string;
  cursorRow: number;
  cursorCol: number;
  capturePath: string;
  timestamp: string;
}

export class TerminalSessionManager {
  public createSession(config: TerminalSessionConfig): Promise<PtyProcess>;
  public getSession(id: string): PtyProcess | undefined;
  public sendInput(id: string, text: string, pressEnter?: boolean): Promise<void>;
  public sendControlKey(id: string, key: 'ctrl-c' | 'ctrl-d' | 'escape' | 'tab'): Promise<void>;
  public waitIdle(id: string, options?: { maxWaitMs?: number; idleStabilityMs?: number }): Promise<boolean>;
  public captureScreen(id: string, linesCount?: number): Promise<TerminalCapture>;
  public destroySession(id: string): Promise<void>;
  public destroyAll(): Promise<void>;
}
```

### 3.3. Exposing Tools to AgentOS

We implement two new tools in `packages/tools/src/implementations/`:
1. `terminal_interactive`:
   - Parameters:
     - `action`: `'start' | 'send' | 'capture' | 'wait' | 'stop'`
     - `sessionId`: string
     - `input`: optional string
     - `controlKey`: optional string (`ctrl-c`, `ctrl-d`, etc.)
     - `waitForIdle`: boolean (default `true`)
   - Returns the rendered terminal screen snapshot.

---

## 4. Safety & Resource Lifecycle

1. **Automatic Disposal**: All PTY sessions are tracked in a weak registry. When `AgentLoop` finishes (or fails), `TerminalSessionManager.destroyAll()` terminates child processes.
2. **Policy Enforcement**: Commands typed into `terminal_send` still check `commandPolicyEngine` to prevent unapproved destructive operations.
3. **Screen Buffer Sanitization**: Captures are stripped of raw escape codes using an internal terminal emulator buffer (`xterm-headless`), presenting the LLM with clean, human-readable terminal output.

---

## 5. Verification & Acceptance Criteria
- [ ] Successfully starts an interactive Node/Python REPL, evaluates expressions, and captures outputs.
- [ ] Successfully starts a background dev server (`vite` / `bun run dev`), verifies it is listening, and continues session without terminating the server.
- [ ] `waitIdle` accurately detects when long build processes finish.
- [ ] `ctrl-c` cleanly terminates hung sub-processes in the PTY session.
- [ ] Windows ConPTY and POSIX pseudo-terminals operate consistently.
