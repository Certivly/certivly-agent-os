# Plan 07: OpenCode Architectural Adoption & Resilience Capabilities

**Document:** `plans/v1/07-opencode-architecture-and-capabilities.md`  
**Date:** 2026-10-09  
**Status:** Architecture Complete & Implementation Specification  
**Benchmarked Source:** `anomalyco/opencode` (analyzed in `.opencode/`)

---

## 1. Executive Summary & Objective

Following a direct, repository-level architectural analysis of **OpenCode** (`anomalyco/opencode`), this plan specifies five high-leverage architectural patterns to integrate into **AgentOS**:

1. **Managed Tool Output Storage (`ToolOutputStore`)**: Prevent token window blowouts from voluminous shell commands, test suites, and build logs by enforcing hard output bounds (2,000 lines / 50 KB), writing verbatim outputs to managed spillover storage (`~/.agentos/tool-output/`), and providing balanced bidirectional previews (head + tail) with pointer markers.
2. **Structured Task & Todo Tracking Tool (`todowrite`)**: Implement a dedicated `todowrite` tool enabling the LLM to maintain an explicit, typed checklist of subtasks with status (`pending`, `in_progress`, `completed`, `cancelled`) and priority, preventing task drift during deep refactoring loops.
3. **Anchored 5-Section Delta Compaction**: Standardize all compaction passes (deterministic mechanical and LLM-assisted) onto OpenCode's strict 5-part Markdown schema (`Objective`, `Important Details`, `Work State` [Completed / Active / Blocked], `Next Move`, `Relevant Files`) with iterative `<prior-summary>` delta preservation.
4. **Context Epochs & Cache-Stabilized System Context**: Eliminate KV cache invalidation by freezing the baseline system prompt for the duration of the session and streaming dynamic environment mutations (git branch changes, active todos, completed files) as chronological messages rather than system prompt overwrites.
5. **Shadow Git Snapshots & Granular Turn Rollback**: Create isolated content-addressed snapshot trees in a shadow git repository to enable safe, per-turn diff review and instant rollback without contaminating the user's primary git worktree or discarding uncommitted user changes.

---

## 2. Subsystem Specifications

### 2.1. Managed Tool Output Storage (`packages/tools/src/storage/ToolOutputStore.ts`)

#### Architectural Problem
Commands like `bun test`, `npm run build`, `git log`, or recursive searches can produce 5,000–50,000 lines of output. Ingesting this verbatim consumes tens of thousands of tokens, blows out the context budget, or pushes critical system instructions out of memory. Conversely, truncating to just the first 100 lines drops the terminal error stack trace (usually at the very bottom).

#### OpenCode Pattern
OpenCode captures tool output, inspects line count and byte length against strict limits (`MAX_LINES = 2,000`, `MAX_BYTES = 50 * 1024`), spills the complete text to `~/.opencode/tool-output/tool_<ascending_id>`, and constructs a bidirectional preview:
- First $N/2$ lines (shows how the command began and initial operations)
- Truncation marker containing the absolute disk path to the full output
- Last $N/2$ lines (shows the final failure summary or exit stack trace)

#### AgentOS Implementation Design
```typescript
export interface ToolOutputBounds {
  maxLines: number;
  maxBytes: number;
}

export interface BoundedToolOutput {
  preview: string;
  isTruncated: boolean;
  spilloverPath?: string;
  totalLines: number;
  totalBytes: number;
}

export class ToolOutputStore {
  public static readonly DEFAULT_MAX_LINES = 2_000;
  public static readonly DEFAULT_MAX_BYTES = 50 * 1024; // 50 KB
  public static readonly RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(private storageDir?: string) {}

  public async boundOutput(
    rawOutput: string,
    options?: Partial<ToolOutputBounds>
  ): Promise<BoundedToolOutput>;

  public async cleanupExpired(): Promise<number>;
}
```

Integration into `packages/tools/src/implementations/run_command.ts` and `packages/tools/src/policy.ts`:
- Replace simplistic character slice with `ToolOutputStore.boundOutput`.
- Provide the model with the exact spillover path so it can inspect specific line ranges with `read_file` if needed.

---

### 2.2. Structured Task Checklist Tool (`todowrite`) & `SessionTodoManager`

#### Architectural Problem
In long, multi-turn coding sessions (10+ turns), models suffer from plan degradation: they forget what tasks remain, repeat already-completed steps, or claim completion while remaining subtasks are unfinished.

#### OpenCode Pattern
OpenCode exposes a first-class tool `todowrite`:
```json
{
  "name": "todowrite",
  "description": "Create and maintain a structured task list for the current coding session. Use it to track progress during multi-step work and keep todo statuses current.",
  "parameters": {
    "todos": [
      {
        "content": "Add tests for auth provider",
        "status": "in_progress",
        "priority": "high"
      }
    ]
  }
}
```
State is saved to SQLite, emitted over the event bus (`todo.updated`), and displayed in the terminal interface.

#### AgentOS Implementation Design
1. **Tool Definition**: `packages/tools/src/implementations/todowrite.ts`
   - Inputs validated via typed schemas:
     - `content`: string (task description)
     - `status`: `'pending' | 'in_progress' | 'completed' | 'cancelled'`
     - `priority`: `'high' | 'medium' | 'low'`
2. **Session Todo State**: `packages/agent-runtime/src/loop/SessionTodoManager.ts`
   - Maintains active todos per session in memory and persists to SQLite session database.
   - Provides helper to format active todos into context or CLI progress displays.
3. **Tool Registry Integration**: Automatically registered alongside existing workspace tools.

---

### 2.3. Anchored 5-Section Delta Compaction

#### Architectural Problem
Free-form summarization causes compounding information loss across successive compaction passes. Compaction pass 2 forgets constraints established in compaction pass 1.

#### OpenCode Pattern
Enforces a deterministic 5-section Markdown anchor:
1. `## Objective`
2. `## Important Details`
3. `## Work State` (`### Completed`, `### Active`, `### Blocked`)
4. `## Next Move`
5. `## Relevant Files`

When updating prior summaries, it feeds:
```markdown
<conversation>
...
</conversation>

<prior-summary>
...
</prior-summary>
```
With explicit delta instructions to carry forward unfinished objectives and unfulfilled constraints.

#### AgentOS Implementation Design
- Standardize `packages/agent-runtime/src/compaction/MechanicalCompactionEngine.ts` to output this exact 5-section format.
- Structure future LLM compaction prompts to adhere to the identical schema, ensuring bidirectional interoperability between 0-token mechanical compaction and LLM-assisted summaries.

---

### 2.4. Context Epochs & Cache-Stabilized System Context

#### Architectural Problem
Prepending or appending dynamic environment updates (e.g. `ContextAssembler.toSystemPromptSection`) directly to the system prompt invalidates the KV cache on Anthropic, OpenAI, DeepSeek, and Gemini, increasing token costs by 5–10x.

#### OpenCode Pattern
- **Baseline System Context**: Rendered once and kept strictly immutable for the epoch.
- **Mid-Conversation System Messages**: Changes in environment state (new files touched, active todos updated, verification failure) are injected into the message history as chronological messages (`[System update]: ...`) rather than editing the `systemPrompt`.
- The system prompt string stays byte-for-byte identical, guaranteeing a 100% cache hit on the prefix.

#### AgentOS Implementation Design
- In `AgentLoop.ts`, keep `BASE_AGENT_SYSTEM_PROMPT` + static project instructions completely static.
- When `ContextAssembler` detects changes (such as verification failures or active todos), inject them as a system turn message in the history rather than modifying the root `systemPrompt`.

---

### 2.5. Shadow Git Snapshots & Checkpoints

#### Architectural Problem
If an agent edits 4 files and fails verification or gets interrupted, the user is left with a dirty working tree. Running `git checkout -- .` wipes out the user's uncommitted work along with the agent's changes.

#### OpenCode Pattern
- Operates a detached shadow git repository in `~/.opencode/snapshot/<project_id>/<worktree_hash>`.
- Captures content-addressed git trees before and after turns.
- Generates precise per-turn reverse patches, allowing surgical rollback of only the files modified by that specific agent turn.

#### AgentOS Implementation Design
- Add `ShadowSnapshotManager` in `packages/sandbox` / `packages/agent-runtime`.
- Capture git trees before executing write tools (`write_file`, `edit_file`, `apply_patch`).
- Provide `/revert` command in CLI/TUI to roll back individual assistant turns cleanly.

---

## 3. Implementation Phasing & Validation Gates

| Phase | Component | Location | Validation Gate |
|---|---|---|---|
| **Phase 1** | Managed Tool Output Storage (`ToolOutputStore`) | `packages/tools/src/storage/` | Unit tests: large stdout truncated, bidirectional preview verified, disk file written, middle lines queryable. |
| **Phase 2** | `todowrite` Tool & `SessionTodoManager` | `packages/tools/src/implementations/`, `packages/agent-runtime/` | Tool invocation updates checklist, emits events, enforces schema validation. |
| **Phase 3** | Anchored 5-Section Compaction | `packages/agent-runtime/src/compaction/` | Formats outputs matching schema; verified in unit tests. |
| **Phase 4** | Prompt Cache Stabilization | `packages/agent-runtime/src/loop/` | System prompt remains byte-identical across multiple turns; dynamic context emitted via message history. |
| **Phase 5** | Regression & Release Gates | Repository root | `bunx tsc --noEmit`, `bun test`, `bun run release:check` passing 100%. |
