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

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpJsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
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
