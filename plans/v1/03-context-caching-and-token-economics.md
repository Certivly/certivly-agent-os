# Plan 03: Prefix-Stable Prompt Caching & Context Token Economics

**Status:** Proposed Architecture  
**Inspired By:** Freebuff / Codebuff (KV cache prefix stability), OpenCode (Provider cache markers), DeepSeek & Anthropic prompt caching economics  
**Target Packages:** `packages/agent-runtime`, `packages/providers`, `packages/metrics`  
**Strict Directives:** Planning only — zero production code modifications.

---

## 1. Problem Statement: The Cache-Busting Bug in AgentOS

Modern LLM providers (Anthropic Claude, DeepSeek V3/V4, OpenAI GPT-4o, Google Gemini) offer prompt caching that reduces prompt token costs by up to **90%** and cuts Time-to-First-Token (TTFT) by up to **80%**.

However, prompt caching relies strictly on **longest common prefix matching**. If token $0$ through token $K$ are identical to a previously cached request, the provider reuses the KV cache. If even a single token in the prefix changes, the entire cache is invalidated.

### The Bug in `AgentLoop.ts` (Lines 312–314)
In our current codebase:
```typescript
// packages/agent-runtime/src/loop/AgentLoop.ts
const snapshot = ContextAssembler.build(loopState, { ... });
const turnContextSection = ContextAssembler.toSystemPromptSection(snapshot);
const turnSystemPrompt = turnContextSection ? `${turnContextSection}\n\n${systemPrompt}` : systemPrompt;
```
`snapshot` contains:
- `recentToolResults`: Updates every turn with recent tool call names and error messages.
- `pendingVerificationFailure`: Changes whenever verification fails or clears.
- `pendingChangesetSummary`: Changes as `filesEdited` increases.

**Because `turnContextSection` is prepended to the start of `systemPrompt`, the first tokens of the request mutate on every single turn!** As a result:
- **Cache Hit Rate: 0%**
- Every turn re-processes all base system guidelines, all tool schemas, all `AGENTS.md` instructions, and all plan text from scratch.
- Cost per session increases by ~500–1,000%, and turnaround time slows down dramatically.

---

## 2. Target Prompt Layout: Strict Prefix Partitioning

To achieve 90%+ prompt cache hit rates across Anthropic, DeepSeek, and OpenAI, prompt generation must be partitioned into two distinct segments:
1. **The Static Prefix** (100% byte-identical throughout the session).
2. **The Dynamic Tail** (changes per turn, placed after the static prefix).

```
┌────────────────────────────────────────────────────────┐
│  STATIC PREFIX (Cached: 90%+ hit rate)                 │
│  ├─ 1. Base Agent Guidelines (BASE_AGENT_SYSTEM_PROMPT) │
│  ├─ 2. Full Tool Definitions & Schemas                 │
│  ├─ 3. Project Rules (AGENTS.md / Copilot Instructions) │
│  └─ 4. Architectural Plan (pinned at session start)    │
│  [CACHE BREAKPOINT: cache_control = { type: "ephemeral" }] │
├────────────────────────────────────────────────────────┤
│  DYNAMIC TAIL (Uncached / Rolling)                     │
│  ├─ 1. Turn Snapshot (Recent tool results, edit count)  │
│  ├─ 2. Compacted Message History                       │
│  └─ 3. Current User Message                            │
└────────────────────────────────────────────────────────┘
```

---

## 3. Component Specifications

### 3.1. Refactored `ContextAssembler.ts`

Currently, `ContextAssembler.toSystemPromptSection` formats the dynamic snapshot for prepending. We will refactor this to:
1. Keep the system prompt static.
2. Format dynamic snapshot state either as a **suffix** to the system prompt or as an ephemeral **context banner** within the message stream.

```typescript
// Proposed refactor pattern in ContextAssembler.ts

export class ContextAssembler {
  /**
   * Generates the immutable static system prompt prefix.
   * This MUST remain byte-identical across all turns of the session.
   */
  static buildStaticSystemPrompt(options: {
    basePrompt: string;
    instructions?: LoadedInstructions;
    plan?: LightweightPlan;
  }): string {
    const parts: string[] = [options.basePrompt.trim()];

    if (options.instructions?.rootInstructions) {
      parts.push(`\n## Project Guidelines (AGENTS.md):\n${options.instructions.rootInstructions.trim()}`);
    }

    if (options.instructions?.copilotInstructions) {
      parts.push(`\n## Workspace Rules:\n${options.instructions.copilotInstructions.trim()}`);
    }

    if (options.plan) {
      parts.push(`\n## Architectural Execution Plan:\n${LightweightPlanner.formatPlan(options.plan)}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Formats dynamic turn-varying observations to be placed AFTER the static prefix.
   */
  static buildDynamicTurnBanner(snapshot: ContextSnapshot): string {
    const lines: string[] = ['### Turn Observations:'];
    if (snapshot.pendingChangesetSummary) {
      lines.push(`- Pending modifications: ${snapshot.pendingChangesetSummary}`);
    }
    if (snapshot.pendingVerificationFailure) {
      lines.push(`- Verification status: FAILING\n\`\`\`\n${snapshot.pendingVerificationFailure.slice(0, 1000)}\n\`\`\``);
    }
    if (snapshot.recentToolResults) {
      lines.push(`- Recent tool executions:\n${snapshot.recentToolResults}`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
  }
}
```

### 3.2. Provider Cache Breakpoint Support (`GenerationRequest`)

Extend `@agent-os/providers` to support cache control annotations (Anthropic and OpenRouter cache markers):

```typescript
// Proposed update in packages/providers/src/types.ts

export interface CacheControl {
  type: 'ephemeral';
}

export interface GenerationRequest {
  systemPrompt: string;
  systemPromptCacheControl?: CacheControl; // Instructs provider to place cache breakpoint at end of systemPrompt
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolsCacheControl?: CacheControl;
  signal?: AbortSignal;
}
```

#### Adapter Implementation (Anthropic & OpenRouter)
In `packages/providers/src/adapters/anthropic.ts` and `openrouter.ts`:
```typescript
// Pass cache_control: { type: "ephemeral" } on the system message or last tool definition
const systemPayload = [
  {
    type: "text",
    text: request.systemPrompt,
    cache_control: { type: "ephemeral" },
  },
];
```

---

## 4. Tool Output Truncation & Token Compaction

A major source of context pollution in long sessions is unconstrained tool output (e.g. running `bun test` with 500 lines of output or reading a large 2,000-line file).

### Truncation Policy:
1. **`run_command` output**:
   - Cap tool return value to **4,000 characters (~1,000 tokens)**.
   - If output exceeds the cap, keep the head (first 1,000 chars) and the tail (last 3,000 chars), with a clear marker:
     `\n... [Truncated 8,420 characters. To view full output, run specific grep or test target] ...\n`
2. **`read_file` output**:
   - Encourage slice reads (`startLine`, `endLine`) via tool guidance.
   - Hard cap full file reads to 8,000 characters (~2,000 tokens).

---

## 5. Cache Metrics & Token Economics Telemetry

To verify cache hit improvements, extend `RunSummary` and `DaemonMetrics`:

```typescript
// Proposed metrics addition
export interface CacheUsageMetrics {
  totalInputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  cacheHitRate: number; // cacheReadInputTokens / totalInputTokens
  estimatedCostUsd: number;
  estimatedSavingsUsd: number;
}
```

### Verification Target:
- Under our proposed prefix layout, turns 2 through $N$ of any session should achieve $\ge 85\%$ cache hit rate on Anthropic, DeepSeek, and OpenRouter.

---

## 6. Implementation Roadmap (Post-Approval)

| Step | Target File | Description |
| :--- | :--- | :--- |
| 3.1 | `packages/providers/src/types.ts` | Add `systemPromptCacheControl` and cache token usage properties |
| 3.2 | `packages/providers/src/adapters/anthropic.ts` | Map `systemPromptCacheControl` to Anthropic `cache_control` |
| 3.3 | `packages/providers/src/adapters/openrouter.ts` | Pass OpenRouter prompt cache flags |
| 3.4 | `packages/agent-runtime/src/loop/ContextAssembler.ts` | Separate static system prompt prefix from dynamic turn observations |
| 3.5 | `packages/agent-runtime/src/loop/AgentLoop.ts` | Fix lines 312–314 to keep system prompt static and append turn banner to dynamic tail |
| 3.6 | `packages/agent-runtime/src/loop/compactHistory.ts` | Enhance tool output truncation caps |
| 3.7 | `packages/agent-runtime/tests/prompt-caching-stability.test.ts` | Add regression test verifying system prompt prefix identity across 10 turns |
