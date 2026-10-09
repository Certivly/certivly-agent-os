import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  McpServerConnection,
  McpToolBridge,
  McpClientManager,
  ToolRegistry,
} from '../src';

describe('Model Context Protocol (MCP) Client Integration (Phase 2)', () => {
  let tmpDir: string;
  let serverScriptPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    serverScriptPath = path.join(tmpDir, 'mock-mcp-server.js');

    // Create a mock MCP server communicating over stdio using line-delimited JSON-RPC 2.0
    const serverCode = `
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const msg = JSON.parse(trimmed);
    if (msg.method === 'initialize') {
      const resp = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-sqlite', version: '1.0.0' }
        }
      };
      process.stdout.write(JSON.stringify(resp) + '\\n');
    } else if (msg.method === 'notifications/initialized') {
      // Notification, no response needed
    } else if (msg.method === 'tools/list') {
      const resp = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            {
              name: 'query_db',
              description: 'Run read-only SQL query on the database',
              inputSchema: {
                type: 'object',
                properties: { sql: { type: 'string' } },
                required: ['sql']
              }
            },
            {
              name: 'create_table',
              description: 'Execute DDL statement to create a database table',
              inputSchema: {
                type: 'object',
                properties: { ddl: { type: 'string' } },
                required: ['ddl']
              }
            }
          ]
        }
      };
      process.stdout.write(JSON.stringify(resp) + '\\n');
    } else if (msg.method === 'tools/call') {
      const toolName = msg.params.name;
      const args = msg.params.arguments || {};
      let resultText = '';
      if (toolName === 'query_db') {
        resultText = 'Rows: [{"id": 1, "name": "Alice"}]';
      } else {
        resultText = 'Table created successfully';
      }
      const resp = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: resultText }],
          isError: false
        }
      };
      process.stdout.write(JSON.stringify(resp) + '\\n');
    }
  } catch (err) {
    // Ignore error in mock server
  }
});
`;
    fs.writeFileSync(serverScriptPath, serverCode);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('connects to stdio MCP server, performs handshake, and lists tools', async () => {
    const conn = new McpServerConnection('sqlite', {
      type: 'stdio',
      command: 'node',
      args: [serverScriptPath],
    });

    try {
      await conn.connect();
      const tools = await conn.listTools();

      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe('query_db');
      expect(tools[1].name).toBe('create_table');

      const callRes = await conn.callTool('query_db', { sql: 'SELECT * FROM users' });
      expect(callRes.isError).toBe(false);
      expect(callRes.content[0].text).toContain('Alice');
    } finally {
      await conn.disconnect();
    }
  });

  it('McpToolBridge namespaces tool names and infers readOnly permissions', async () => {
    const conn = new McpServerConnection('db', {
      type: 'stdio',
      command: 'node',
      args: [serverScriptPath],
    });

    try {
      await conn.connect();
      const tools = await conn.listTools();

      const readTool = new McpToolBridge('db', tools[0], conn);
      expect(readTool.spec.name).toBe('mcp__db__query_db');
      expect(readTool.spec.readOnly).toBe(true);
      expect(readTool.requiresApproval()).toBe(false);

      const writeTool = new McpToolBridge('db', tools[1], conn);
      expect(writeTool.spec.name).toBe('mcp__db__create_table');
      expect(writeTool.spec.readOnly).toBe(false);
      expect(writeTool.requiresApproval()).toBe(true);

      const execResult = await readTool.execute({ sql: 'SELECT 1' }, { workspaceRoot: tmpDir });
      expect(execResult.isError).toBe(false);
      expect(execResult.content).toContain('Alice');
    } finally {
      await conn.disconnect();
    }
  });

  it('McpClientManager loads configuration, bridges tools, and integrates with ToolRegistry', async () => {
    const registry = new ToolRegistry();
    const manager = new McpClientManager(tmpDir);

    const serverCount = await manager.registerServers({
      myserver: {
        type: 'stdio',
        command: 'node',
        args: [serverScriptPath],
      },
    });

    expect(serverCount).toBe(1);
    expect(manager.getConnectedServers()).toEqual(['myserver']);

    const registered = await registry.registerMcpManager(manager);
    expect(registered).toBe(2);

    const toolNames = registry.list().map((t) => t.spec.name);
    expect(toolNames).toContain('mcp__myserver__query_db');
    expect(toolNames).toContain('mcp__myserver__create_table');

    const invokeResult = await registry.invoke('mcp__myserver__query_db', { sql: 'SELECT * FROM users' });
    expect(invokeResult).toContain('Alice');

    await manager.shutdown();
  });
});
