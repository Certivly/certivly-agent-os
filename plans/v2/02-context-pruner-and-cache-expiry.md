# Plan 02: Autonomous Context Pruner & Cache Expiry Optimizer

**Document:** `plans/v2/02-context-pruner-and-cache-expiry.md`  
**Date:** 2026-10-09  
**Status:** Implementation Specification  
**Benchmark Source:** Freebuff (`agents/context-pruner.ts`)

---

## 1. Problem Statement & Motivation

As multi-agent workflows evolve, a primary agent spawns subagents (`FilePickerAgent`, `SearchSubagent`, `ReviewSubagent`, `LibrarianSubagent`).
Each subagent might execute 5 to 15 tool calls (reading directories, inspecting ASTs, running tests).
When the subagent completes, it returns a concise 5-line summary. However, in naive architectures, **the entire subagent trajectory (including 20,000 tokens of raw file reads and grep results) remains in the session history**.

By turn 15:
- The context window is 80% populated by old tool outputs from subagents that already finished.
- Latency and cost explode.
- The model suffers from "distraction" from stale tool outputs.

---

## 2. Freebuff Architectural Pattern (`context-pruner.ts`)

Freebuff introduces a specialized **Context Pruner** with three standout features:

### 2.1. Subagent Output Scrubbing (`SPAWN_AGENTS_OUTPUT_BLACKLIST`)
Once a subagent has returned its final structured conclusion to the orchestrator, the pruner scrubs the detailed intermediate step logs of:
- `file-picker`
- `researcher-web` / `researcher-docs`
- `librarian`
- `tmux-cli`
- `code-reviewer`

The parent agent retains the subagent's **final verdict and candidate file list**, but the 30 intermediate grep/cat outputs are wiped from the conversational context.

### 2.2. Asymmetric Token Budgeting
Freebuff avoids symmetric head/tail truncation by establishing distinct budgets:
- `USER_BUDGET`: 50,000 tokens (User constraints, clarifications, and requirements are given highest retention priority).
- `ASSISTANT_TOOL_BUDGET`: 20,000 tokens (Tool outputs, stack traces, and intermediate thoughts are strictly capped).

### 2.3. Cache-Expiry-Aware Pruning (`CACHE_EXPIRY_MS = 300_000`)
- Standard prompt caching (Anthropic, DeepSeek, OpenAI) has a 5-minute time-to-live (TTL).
- **If $\Delta t < 5 \text{ min}$**: The pruner avoids mutating historical message prefixes to preserve the warm KV cache hit rate ($>90\%$).
- **If $\Delta t \ge 5 \text{ min}$**: The cache is already cold! The pruner aggressively compresses historical turns down to minimal essential state before the next generation starts, saving massive input tokens on the fresh cache creation.

---

## 3. AgentOS Engineering Specification

### 3.1. Subsystem Architecture: `packages/agent-runtime/src/compaction/ContextPruner.ts`

```typescript
export interface ContextPrunerPolicy {
  maxContextTokens: number;         // Trigger threshold (e.g. 60,000 tokens)
  targetContextTokens: number;      // Target after pruning (e.g. 25,000 tokens)
  userTokenBudget: number;          // Default: 50,000 tokens
  toolTokenBudget: number;          // Default: 20,000 tokens
  cacheExpiryMs: number;            // Default: 300,000ms (5 minutes)
  subagentBlacklist: string[];      // Subagent IDs whose tool steps are scrubbed
}

export interface PruningAudit {
  tokensBefore: number;
  tokensAfter: number;
  subagentsScrubbed: number;
  cacheExpired: boolean;
  messagesCondensed: number;
}

export class ContextPruner {
  public static readonly DEFAULT_BLACKLIST = [
    'file-picker',
    'search-subagent',
    'review-subagent',
    'librarian',
    'tmux-cli',
    'browser-use',
  ];

  public prune(
    history: LoopMessage[],
    lastTurnTimestamp: number,
    policy?: Partial<ContextPrunerPolicy>
  ): { prunedHistory: LoopMessage[]; audit: PruningAudit };
}
```

### 3.2. Scrubbing Algorithm
1. Detect subagent boundaries in `LoopMessage` stream:
   - Identify tool calls to `spawn_agent` or subagent delegators.
   - Match assistant conclusion where `subagent.status === 'completed'`.
2. Replace intermediate tool call messages with a lightweight stub:
   ```json
   {
     "role": "tool",
     "name": "subagent_trace",
     "content": "[Subagent execution completed. 14 intermediate search steps scrubbed to conserve context. Final result retained above.]"
   }
   ```
3. Retain the exact final structured output.

---

## 4. Integration into AgentLoop

In `AgentLoop.ts`:
```typescript
// Before model generation turn:
if (estimateHistoryTokens(rawHistory) > this.options.maxApproxTokens * 0.75) {
  const pruner = new ContextPruner();
  const { prunedHistory, audit } = pruner.prune(rawHistory, this.lastTurnTimestamp);
  if (audit.tokensBefore > audit.tokensAfter) {
    this.eventBus.publish('context.pruned', { sessionId, audit });
    rawHistory = prunedHistory;
  }
}
```

---

## 5. Verification & Acceptance Criteria
- [ ] Subagent tool records are cleanly scrubbed while preserving the subagent's final output.
- [ ] User messages are preserved up to `USER_BUDGET` without losing early constraints.
- [ ] If turn interval $< 5 \text{ min}$, prefix remains byte-identical; if $\ge 5 \text{ min}$, aggressive compression triggers.
- [ ] Unit tests verifying 50–70% token reductions on sessions with multiple subagent invocations.
