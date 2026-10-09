# Plan 02: Native Model Context Protocol (MCP) Client Integration

**Status:** Proposed Architecture  
**Inspired By:** OpenCode (`anomalyco/opencode`), Qwen-Agent (`QwenLM/Qwen-Agent`)  
**Target Packages:** `packages/tools`, `packages/config`, `packages/agent-runtime`, `apps/cli`  
**Strict Directives:** Planning only — zero production code modifications.

---

## 1. Motivation & Problem Statement

Currently, AgentOS only provides a fixed set of built-in tools (`read_file`, `write_file`, `edit_file`, `apply_patch`, `run_command`, `grep`, `list_dir`, `repo_map`) plus local directory plugins via `PluginManager`.

Both **OpenCode** and **Qwen-Agent** feature first-class **Model Context Protocol (MCP)** support. Anthropic's MCP has become the open industry standard for connecting AI coding assistants to external services:
- Database clients (PostgreSQL, SQLite, MySQL, Supabase, BigQuery)
- SCM / Cloud services (GitHub, GitLab, AWS, Cloudflare, Docker, Kubernetes)
- Browser automation (Puppeteer, Playwright)
- Memory graphs and local documentation indexers

Without native MCP client support, AgentOS users cannot tap into the rapidly growing ecosystem of community tools without authoring custom TypeScript plugins.

---

## 2. Architecture & Protocol Design

```mermaid
flowchart TD
    Config[".agentos/mcp.json or config.json"] --> Manager[McpClientManager]
    Manager --> Spawn[Spawn Stdio Process / Connect SSE]
    Spawn --> Handshake[MCP Handshake & Initialize]
    Handshake --> List[tools/list RPC]
    List --> Bridge[McpToolBridge]
    Bridge --> Registry[ToolRegistry (@agent-os/tools)]
    Registry --> Policy[ToolPolicy & PermissionGuard]
    Policy --> Loop[AgentLoop]
    
    Loop -->|Invoke MCP Tool| Bridge
    Bridge -->|tools/call JSON-RPC| Process[MCP Server Process]
    Process -->|Result / Error| Bridge
    Bridge -->|ToolExecutionResult| Loop
```

---

## 3. Configuration Specification

Users can configure MCP servers in `.agentos/mcp.json` (workspace-level) or `~/.agentos/mcp.json` (global user-level):

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./dev.sqlite"],
      "env": {
        "DEBUG": "false"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "custom-remote": {
      "url": "https://mcp.internal.company.com/sse",
      "headers": {
        "Authorization": "Bearer ${MCP_TOKEN}"
      }
    }
  }
}
```

---

## 4. Component Design

### 4.1. Core MCP Client Types & Interfaces

```typescript
// Proposed path: packages/tools/src/mcp/types.ts

export type McpTransportType = 'stdio' | 'sse';

export interface McpStdioConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface McpSseConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioConfig | McpSseConfig;

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
```

### 4.2. MCP Client Manager (`McpClientManager.ts`)

```typescript
// Proposed path: packages/tools/src/mcp/McpClientManager.ts

export class McpClientManager {
  private servers: Map<string, McpServerConnection> = new Map();

  constructor(private workspaceRoot: string) {}

  /**
   * Loads configurations from workspace and user configs and establishes connections
   */
  async initializeFromConfig(configPath?: string): Promise<void>;

  /**
   * Retrieves all tools exposed by all connected MCP servers and wraps them into ToolRegistry specs
   */
  async registerTools(registry: ToolRegistry): Promise<number>;

  /**
   * Graceful shutdown of child processes and HTTP connections
   */
  async shutdown(): Promise<void>;
}
```

### 4.3. Tool Bridge Adapter (`McpToolBridge.ts`)

Wraps an individual remote MCP tool into a standard `@agent-os/tools` `LoopTool`:

```typescript
// Proposed path: packages/tools/src/mcp/McpToolBridge.ts

export class McpToolBridge implements LoopTool {
  public spec: LoopToolSpec;
  public requiresApproval: boolean = false;

  constructor(
    private serverName: string,
    private rawTool: McpToolDefinition,
    private connection: McpServerConnection,
    private policy: ToolPolicy
  ) {
    // Prefix tool name to prevent collision with built-in tools: e.g. "mcp__github__create_issue"
    const namespacedName = `mcp__${serverName}__${rawTool.name}`;
    
    this.spec = {
      name: namespacedName,
      description: `[MCP: ${serverName}] ${rawTool.description ?? ''}`,
      parameters: rawTool.inputSchema,
      readOnly: this.inferReadOnly(rawTool.name, rawTool.description),
    };
    
    this.requiresApproval = !this.spec.readOnly;
  }

  async execute(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
    const rawResult = await this.connection.callTool(this.rawTool.name, args);
    const textOutput = rawResult.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    return {
      content: textOutput || (rawResult.isError ? 'Error in tool execution' : 'Success (empty output)'),
      isError: !!rawResult.isError,
    };
  }

  private inferReadOnly(name: string, desc?: string): boolean {
    const mutatingTerms = /create|update|delete|drop|write|post|put|patch|execute|run/i;
    return !mutatingTerms.test(name) && !mutatingTerms.test(desc || '');
  }
}
```

---

## 5. Security & Permission Governance

MCP tools must never bypass AgentOS's security boundaries:
1. **Namespace Isolation**: All MCP tools are prefixed with `mcp__<serverName>__<toolName>` to prevent shadowing built-in core tools (`read_file`, `write_file`).
2. **Approval Integration**: Read-only tools execute automatically under `manual` mode; mutating tools require explicit user approval (or auto approval only when running in `--permission-mode=auto`).
3. **Environment Variable Redaction**: Secrets passed to MCP server child processes are masked in debug logs and event streams.
4. **Execution Timeouts**: Every MCP RPC call is bounded by a configurable timeout (default 30,000ms) with process kill capability.

---

## 6. CLI Commands & Doctor Diagnostics

1. **`agentos mcp list`**:
   - Prints configured MCP servers, connection status (healthy / offline), and list of registered tools.
2. **`agentos doctor mcp`**:
   - Validates configuration syntax in `.agentos/mcp.json`.
   - Tests stdio process spawning and health check handshake.
   - Reports latency and tool count.

---

## 7. Implementation Roadmap (Post-Approval)

| Step | Target File | Description |
| :--- | :--- | :--- |
| 2.1 | `packages/tools/src/mcp/types.ts` | Define MCP schema and transport types |
| 2.2 | `packages/tools/src/mcp/StdioTransport.ts` | Implement robust child process stdio JSON-RPC transport |
| 2.3 | `packages/tools/src/mcp/McpServerConnection.ts` | Manage lifecycle, initialize handshake, and RPC dispatching |
| 2.4 | `packages/tools/src/mcp/McpToolBridge.ts` | Wrap MCP tools into `LoopTool` with namespace isolation |
| 2.5 | `packages/tools/src/mcp/McpClientManager.ts` | Orchestrate servers from `.agentos/mcp.json` |
| 2.6 | `packages/tools/src/registry.ts` | Add `registerMcpManager` helper |
| 2.7 | `apps/cli/src/doctor/mcp.ts` | Add MCP diagnostic checks to `agentos doctor` |
| 2.8 | `packages/tools/tests/mcp-bridge.test.ts` | Unit tests with mock stdio process |
