import { StdioTransport } from './StdioTransport';
import type { McpServerConfig, McpToolDefinition, McpToolCallResult } from './types';

export class McpServerConnection {
  private transport: StdioTransport;
  private initialized: boolean = false;

  constructor(
    public readonly name: string,
    private config: McpServerConfig
  ) {
    if (config.type === 'sse') {
      throw new Error(`SSE transport for MCP server '${name}' is not yet supported in this version. Use stdio.`);
    }
    this.transport = new StdioTransport(config);
  }

  public async connect(): Promise<void> {
    if (this.initialized) return;

    await this.transport.start();

    // 1. Send MCP initialize request
    await this.transport.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'agent-os',
        version: '1.0.0',
      },
    });

    // 2. Send initialized notification
    await this.transport.sendNotification('notifications/initialized');
    this.initialized = true;
  }

  public async listTools(): Promise<McpToolDefinition[]> {
    if (!this.initialized) {
      await this.connect();
    }

    const response = (await this.transport.sendRequest('tools/list')) as { tools?: McpToolDefinition[] };
    return Array.isArray(response?.tools) ? response.tools : [];
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    if (!this.initialized) {
      await this.connect();
    }

    const response = (await this.transport.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as McpToolCallResult;

    if (!response || !Array.isArray(response.content)) {
      return {
        content: [{ type: 'text', text: typeof response === 'string' ? response : JSON.stringify(response || {}) }],
        isError: false,
      };
    }

    return response;
  }

  public async disconnect(): Promise<void> {
    this.initialized = false;
    await this.transport.close();
  }
}
