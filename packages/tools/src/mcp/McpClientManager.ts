import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ToolRegistry } from '../registry';
import { McpServerConnection } from './McpServerConnection';
import { McpToolBridge } from './McpToolBridge';
import type { McpConfigFile, McpServerConfig } from './types';

export class McpClientManager {
  private connections: Map<string, McpServerConnection> = new Map();
  private bridgedTools: McpToolBridge[] = [];

  constructor(private workspaceRoot: string = process.cwd()) {}

  /**
   * Initializes MCP servers from user config (~/.agentos/mcp.json) and workspace config (.agentos/mcp.json)
   */
  public async loadFromWorkspaceConfig(customConfigPath?: string): Promise<number> {
    const serversToRegister: Record<string, McpServerConfig> = {};

    // 1. Global User MCP configuration: ~/.agentos/mcp.json
    const globalConfigPath = path.join(os.homedir(), '.agentos', 'mcp.json');
    if (fs.existsSync(globalConfigPath)) {
      try {
        const content = fs.readFileSync(globalConfigPath, 'utf-8');
        const parsed = JSON.parse(content) as McpConfigFile;
        if (parsed && typeof parsed.mcpServers === 'object') {
          Object.assign(serversToRegister, parsed.mcpServers);
        }
      } catch (err: any) {
        console.warn(`[McpClientManager] Failed to parse global MCP config at ${globalConfigPath}:`, err.message);
      }
    }

    // 2. Workspace MCP configuration: .agentos/mcp.json or custom path
    const configPath = customConfigPath
      ? path.resolve(this.workspaceRoot, customConfigPath)
      : path.resolve(this.workspaceRoot, '.agentos', 'mcp.json');

    if (fs.existsSync(configPath) && path.resolve(configPath).toLowerCase() !== path.resolve(globalConfigPath).toLowerCase()) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content) as McpConfigFile;
        if (parsed && typeof parsed.mcpServers === 'object') {
          // Workspace servers override user servers on collision
          Object.assign(serversToRegister, parsed.mcpServers);
        }
      } catch (err: any) {
        console.warn(`[McpClientManager] Failed to parse workspace MCP config at ${configPath}:`, err.message);
      }
    }

    if (Object.keys(serversToRegister).length === 0) {
      return 0;
    }

    return await this.registerServers(serversToRegister);
  }

  public async initializeFromConfig(customConfigPath?: string): Promise<number> {
    return this.loadFromWorkspaceConfig(customConfigPath);
  }

  /**
   * Connects to provided servers and returns count of connected servers
   */
  public async registerServers(servers: Record<string, McpServerConfig>): Promise<number> {
    let connected = 0;
    for (const [name, config] of Object.entries(servers)) {
      try {
        const connection = new McpServerConnection(name, config);
        await connection.connect();
        this.connections.set(name, connection);
        connected++;
      } catch (err: any) {
        console.warn(`[McpClientManager] Failed to connect to MCP server '${name}':`, err.message);
      }
    }
    return connected;
  }

  /**
   * Discovers tools from all active MCP server connections and registers them into ToolRegistry
   */
  public async registerToolsIntoRegistry(registry: ToolRegistry): Promise<McpToolBridge[]> {
    const registered: McpToolBridge[] = [];

    for (const [serverName, connection] of this.connections.entries()) {
      try {
        const rawTools = await connection.listTools();
        for (const rawTool of rawTools) {
          const bridge = new McpToolBridge(serverName, rawTool, connection);
          registry.register(bridge);
          registered.push(bridge);
        }
      } catch (err: any) {
        console.warn(`[McpClientManager] Failed to list tools for server '${serverName}':`, err.message);
      }
    }

    this.bridgedTools.push(...registered);
    return registered;
  }

  public getConnectedServers(): string[] {
    return Array.from(this.connections.keys());
  }

  public getConnection(name: string): McpServerConnection | undefined {
    return this.connections.get(name);
  }

  public getBridgedTools(): McpToolBridge[] {
    return [...this.bridgedTools];
  }

  public async shutdown(): Promise<void> {
    for (const connection of this.connections.values()) {
      try {
        await connection.disconnect();
      } catch {
        // Ignore disconnect errors during shutdown
      }
    }
    this.connections.clear();
    this.bridgedTools = [];
  }

  public async close(): Promise<void> {
    await this.shutdown();
  }
}
