import * as fs from 'fs';
import * as path from 'path';
import { SessionManager } from '@agent-os/sessions';
import { ConfigManager } from '@agent-os/config';

export interface SessionSummary {
  runId: string;
  sessionId: string;
  status: string;
  startedAt: string;
  userInput: string;
  finalText?: string;
}

export class SessionsCommand {
  private getDbPath(): string {
    const configManager = new ConfigManager({ workspaceRoot: process.cwd() });
    const config = configManager.load();
    const sessionDir = config.runtime?.sessionDir || '.agentos/sessions';
    return path.resolve(process.cwd(), sessionDir, 'sessions.db');
  }

  public getSessionManager(): SessionManager | null {
    const dbPath = this.getDbPath();
    if (!fs.existsSync(dbPath)) return null;
    try {
      return new SessionManager(dbPath);
    } catch (_err) {
      return null;
    }
  }

  public listSessions(limit: number = 20): SessionSummary[] {
    const mgr = this.getSessionManager();
    if (!mgr) return [];

    try {
      const runs = mgr.listAllRuns();
      const sorted = runs.sort((a: any, b: any) => {
        const timeA = new Date(a.createdAt || a.startedAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.startedAt || 0).getTime();
        return timeB - timeA;
      });

      return sorted.slice(0, limit).map((r: any) => ({
        runId: r.id,
        sessionId: r.sessionId,
        status: r.status || 'unknown',
        startedAt: r.createdAt ? new Date(r.createdAt).toLocaleString() : 'N/A',
        userInput: r.userInput ? (r.userInput.length > 60 ? r.userInput.slice(0, 57) + '...' : r.userInput) : 'Interactive session',
        finalText: r.finalText,
      }));
    } finally {
      mgr.close();
    }
  }

  public getSessionDetails(id: string): { run?: any; messages: any[]; toolCalls: any[] } | null {
    const mgr = this.getSessionManager();
    if (!mgr) return null;

    try {
      let run = mgr.getRun(id);
      let sessionId = id;

      if (!run) {
        // Maybe id is a sessionId
        const runs = mgr.getRuns(id);
        if (runs.length > 0) {
          run = runs[0];
          sessionId = run.sessionId;
        }
      } else {
        sessionId = run.sessionId;
      }

      const messages = mgr.getMessages(sessionId);
      const toolCalls = mgr.getToolCallsForSession(sessionId);

      return { run, messages, toolCalls };
    } finally {
      mgr.close();
    }
  }

  public exportSession(id: string, format: 'md' | 'json' = 'md', outputPath?: string): { content: string; outputPath?: string } {
    const details = this.getSessionDetails(id);
    if (!details) {
      throw new Error(`Session or run "${id}" not found.`);
    }

    let content = '';

    if (format === 'json') {
      content = JSON.stringify(details, null, 2);
    } else {
      const run = details.run;
      content = `# AgentOS Session Export: ${id}\n\n`;
      content += `- **Session ID**: \`${run?.sessionId || id}\`\n`;
      if (run?.id) content += `- **Run ID**: \`${run.id}\`\n`;
      if (run?.status) content += `- **Status**: ${run.status.toUpperCase()}\n`;
      if (run?.userInput) content += `- **Initial Prompt**: ${run.userInput}\n`;
      content += `\n---\n\n## Conversation Transcript\n\n`;

      if (details.messages.length === 0) {
        content += `*No conversation messages recorded.*\n`;
      } else {
        for (const msg of details.messages) {
          const role = msg.role.toUpperCase();
          content += `### [${role}]\n\n${msg.content}\n\n`;
        }
      }

      if (details.toolCalls.length > 0) {
        content += `\n---\n\n## Tool Executions (${details.toolCalls.length})\n\n`;
        for (const tc of details.toolCalls) {
          content += `#### Tool: \`${tc.name}\`\n`;
          content += `\`\`\`json\n${tc.args}\n\`\`\`\n`;
          if (tc.result) {
            content += `**Result:**\n\`\`\`\n${tc.result.slice(0, 500)}${tc.result.length > 500 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
          }
          content += '\n';
        }
      }
    }

    if (outputPath) {
      const fullPath = path.resolve(process.cwd(), outputPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
      return { content, outputPath: fullPath };
    }

    return { content };
  }
}
