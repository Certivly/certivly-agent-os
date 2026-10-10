# Plan 01: CodeMode Programmatic Tool Orchestration Engine

**Document:** `plans/v2/01-codemode-programmatic-tools.md`  
**Date:** 2026-10-09  
**Status:** Implementation Specification  
**Benchmark Source:** OpenCode (`packages/codemode`)

---

## 1. Problem Statement & Motivation

In traditional coding agents (including AgentOS v1), every tool invocation requires a full LLM turn roundtrip:
1. LLM generates a tool call: `github_list_issues({ state: 'open' })`.
2. Agent executes tool and injects 50 raw JSON issue objects (15,000 tokens) into context.
3. LLM inspects the list and issues another tool call: `github_get_comments({ issue_id: 101 })`.
4. Agent injects comments (another 5,000 tokens).
5. Repeated for 10 issues $\to$ **10 separate LLM roundtrips, 200,000 tokens burned, 90 seconds of latency**.

Furthermore, when 50+ tools are available across multiple MCP servers, injecting all tool schemas into the system prompt consumes 10,000–25,000 tokens *on every single turn*.

---

## 2. OpenCode Architecture Pattern (`packages/codemode`)

OpenCode solves this by introducing **CodeMode**:
- Instead of exposing 50 individual tools to the LLM, it exposes a single meta-tool:
  ```json
  {
    "name": "execute",
    "description": "Execute a JavaScript orchestration program to sequence, parallelize, and filter tool operations in a sandboxed interpreter."
  }
  ```
- The model writes pure JavaScript code:
  ```javascript
  const issues = await github.issues.list({ state: 'open' });
  const critical = issues.filter(i => i.labels.some(l => l.name === 'bug:critical'));
  const comments = await Promise.all(
    critical.slice(0, 5).map(i => github.issues.getComments({ issue_number: i.number }))
  );
  return {
    criticalCount: critical.length,
    summaries: critical.slice(0, 5).map((c, idx) => ({ title: c.title, commentCount: comments[idx].length }))
  };
  ```
- **Confined Interpreter**: Parsed with Acorn into an AST; executed via a custom tree-walking interpreter without `eval` or Node.js global access (`process`, `fs`, `require` are blocked).
- **Zero LLM Roundtrips**: The entire loop and parallel fetching runs in 150ms in-process.
- **Zero Intermediate Context Bloat**: The 50 raw issue JSONs stay inside sandbox memory; only the clean `{ criticalCount, summaries }` payload is returned to the agent context!
- **Dynamic Catalog Search**: `$codemode.search({ query: 'pull request' })` returns targeted signatures on demand.

---

## 3. AgentOS Engineering Specification

### 3.1. Package Architecture: `packages/codemode`

```
packages/codemode/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── interpreter/
│   │   ├── AstInterpreter.ts       # Sandboxed AST tree-walker (no eval)
│   │   ├── Scope.ts                # Lexical scope and variable bindings
│   │   ├── PromiseRunner.ts        # Supervised Promise.all / async execution
│   │   └── ResourceLimits.ts       # Max calls (50), timeout (15s), memory bounds
│   ├── catalog/
│   │   ├── ToolCatalog.ts          # Tree of namespaced tools (e.g. tools.git, tools.fs)
│   │   ├── CatalogSearcher.ts      # $codemode.search implementation
│   │   └── TypeRenderer.ts         # Renders compact TypeScript ambient signatures
│   └── bridge/
│       ├── CodeModeTool.ts         # The WorkspaceTool wrapping the engine
│       └── ToolBridge.ts           # Adapts AgentOS WorkspaceTool & MCP into JS functions
└── tests/
    ├── interpreter.test.ts
    ├── async-combinators.test.ts
    └── catalog-search.test.ts
```

### 3.2. Confined Interpreter Execution Model

```typescript
export interface CodeModeExecutionOptions {
  timeoutMs?: number;        // Default: 15,000ms
  maxToolCalls?: number;     // Default: 50
  maxOutputBytes?: number;   // Default: 50 * 1024 (50 KB)
  concurrencyLimit?: number; // Default: 8 concurrent tool executions
}

export interface CodeModeResult {
  success: boolean;
  returnValue: unknown;
  diagnostics?: string[];
  executionTimeMs: number;
  toolCallsCount: number;
}

export class AstInterpreter {
  public async execute(
    script: string,
    toolNamespace: Record<string, Function>,
    options?: CodeModeExecutionOptions
  ): Promise<CodeModeResult>;
}
```

### 3.3. Safety & Confinement Guarantees
1. **Zero `eval` / `Function`**: Scripts are parsed via Acorn. Syntax outside the safe subset (e.g. `eval`, `Function`, `import()`, `Worker`) is rejected at parse time.
2. **Global Isolation**: The execution scope contains only `Math`, `JSON`, `Date`, `Array`, `Object`, `String`, `Promise`, `console.log`, and the injected tool namespace.
3. **Execution Budgets**: If a loop runs more than 10,000 statements or exceeds `timeoutMs`, execution is forcibly interrupted.
4. **Tool Permission Passthrough**: Any mutating tool called inside the script still evaluates workspace policies and security guards (`WorkspaceManager`, `commandPolicyEngine`).

---

## 4. Integration with AgentOS AgentLoop

1. **Tool Registration**:
   In `AgentRuntime.registerStandardTools()`, if `enableCodeMode: true` is configured in `agentos.config.json`, the registry groups MCP and standard tools into `CodeModeTool`.
2. **Context Compression**:
   Instead of injecting 40 tools into `genRequest.tools`, the agent exposes only:
   - `execute(script: string)`
   - `read_file`, `write_file`, `edit_file` (core direct edit tools)
   - `$codemode.search(query: string)`
3. **Expected Token Savings**: 65% reduction in turn token cost across multi-step tool integrations.

---

## 5. Verification & Acceptance Criteria
- [ ] Confined AST interpreter executes loops, array operations, and `Promise.all` without host leakage.
- [ ] Exceeding 15s timeout or 50 tool calls throws clear diagnostic error.
- [ ] Model successfully writes script to list files, read multiple files concurrently, and aggregate findings in a single turn.
