import * as fs from 'fs';
import * as path from 'path';
import { McpServerConnection } from '@agent-os/tools';
import type { McpConfigFile } from '@agent-os/tools';

export interface McpServerDoctorStatus {
  name: string;
  type: string;
  commandOrUrl: string;
  healthy: boolean;
  toolCount: number;
  tools?: string[];
  error?: string;
}

export class McpDoctor {
  public static async diagnose(options?: {
    workspaceRoot?: string;
    configPath?: string;
  }): Promise<{
    configFound: boolean;
    configPath: string;
    servers: McpServerDoctorStatus[];
  }> {
    const root = options?.workspaceRoot || process.cwd();
    const configPath = options?.configPath
      ? path.resolve(root, options.configPath)
      : path.resolve(root, '.agentos', 'mcp.json');

    let activeConfigPath = configPath;
    if (!fs.existsSync(activeConfigPath)) {
      const agentosConfig = path.resolve(root, 'agentos.config.json');
      if (fs.existsSync(agentosConfig)) {
        try {
          const raw = JSON.parse(fs.readFileSync(agentosConfig, 'utf-8'));
          if (raw.mcpServers && Object.keys(raw.mcpServers).length > 0) {
            activeConfigPath = agentosConfig;
          }
        } catch (_parseErr: any) {
          // Fallback failed
        }
      }
    }

    if (!fs.existsSync(activeConfigPath)) {
      return {
        configFound: false,
        configPath: activeConfigPath,
        servers: [],
      };
    }

    let parsed: McpConfigFile;
    try {
      const content = fs.readFileSync(activeConfigPath, 'utf-8');
      parsed = JSON.parse(content);
    } catch (err: any) {
      return {
        configFound: true,
        configPath: activeConfigPath,
        servers: [
          {
            name: 'syntax_error',
            type: 'invalid_json',
            commandOrUrl: activeConfigPath,
            healthy: false,
            toolCount: 0,
            error: `Failed to parse JSON: ${err.message}`,
          },
        ],
      };
    }

    const servers: McpServerDoctorStatus[] = [];
    for (const [name, config] of Object.entries(parsed.mcpServers || {})) {
      const transportType = config.type || 'stdio';
      const commandOrUrl = 'command' in config ? `${config.command} ${(config.args || []).join(' ')}` : (config as any).url || '';

      try {
        const conn = new McpServerConnection(name, config);
        await conn.connect();
        const tools = await conn.listTools();
        await conn.disconnect();

        servers.push({
          name,
          type: transportType,
          commandOrUrl,
          healthy: true,
          toolCount: tools.length,
          tools: tools.map((t) => t.name),
        });
      } catch (err: any) {
        servers.push({
          name,
          type: transportType,
          commandOrUrl,
          healthy: false,
          toolCount: 0,
          error: err.message,
        });
      }
    }

    return {
      configFound: true,
      configPath,
      servers,
    };
  }

  public static formatReport(result: {
    configFound: boolean;
    configPath: string;
    servers: McpServerDoctorStatus[];
  }): string {
    const lines: string[] = ['Model Context Protocol (MCP) Diagnostics:'];

    if (!result.configFound) {
      lines.push(`  Config: None found at ${result.configPath} (Optional: create .agentos/mcp.json)`);
      return lines.join('\n');
    }

    lines.push(`  Config: Found at ${result.configPath}`);
    if (result.servers.length === 0) {
      lines.push('  Servers: 0 configured');
      return lines.join('\n');
    }

    for (const s of result.servers) {
      const statusIcon = s.healthy ? '[OK]' : '[FAIL]';
      lines.push(`  ${statusIcon} Server: ${s.name} (${s.type})`);
      lines.push(`       Command: ${s.commandOrUrl}`);
      if (s.healthy) {
        lines.push(`       Tools (${s.toolCount}): ${(s.tools || []).join(', ') || 'none'}`);
      } else {
        lines.push(`       Error: ${s.error || 'Unknown error'}`);
      }
    }

    return lines.join('\n');
  }
}
