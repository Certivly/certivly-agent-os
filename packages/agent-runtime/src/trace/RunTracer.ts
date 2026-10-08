import * as fs from 'fs';
import * as path from 'path';
import type { LoggingEventBus } from '@agent-os/shared';

export interface TraceEntry {
  timestamp: string;
  runId: string;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface RunTracerOptions {
  runId?: string;
  sessionId: string;
  workspaceRoot?: string;
  tracesDir?: string;
}

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_\-]{6,}/g,
  /sk-ant-[a-zA-Z0-9_\-]{6,}/g,
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /ghp_[a-zA-Z0-9]{10,}/g,
  /gho_[a-zA-Z0-9]{10,}/g,
  /github_pat_[a-zA-Z0-9_]{10,}/g,
  /xox[baprs]-[a-zA-Z0-9\-]+/g,
  /(?:api_?key|access_?token|secret_?key|auth_?token)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.]{6,})["']?/gi,
  /authorization:\s*(?:bearer\s+)?[a-zA-Z0-9_\-\.]+/gi,
];

const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'token',
  'authorization',
  'auth',
  'secret',
  'password',
  'credential',
  'credentials',
  'access_token',
  'refresh_token',
  'private_key',
]);

export function redactSecrets(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    let result = data;
    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern, '[REDACTED_SECRET]');
    }
    return result;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSecrets(item));
  }

  if (typeof data === 'object') {
    const copy: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        copy[key] = '[REDACTED]';
      } else {
        copy[key] = redactSecrets(value);
      }
    }
    return copy;
  }

  return data;
}

export class RunTracer {
  public readonly runId: string;
  public readonly sessionId: string;
  public readonly traceFilePath: string;

  constructor(options: RunTracerOptions) {
    this.sessionId = options.sessionId;
    this.runId = options.runId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const baseDir =
      options.tracesDir ||
      path.resolve(options.workspaceRoot || process.cwd(), '.agentos', 'traces');
    const sessionDir = path.join(baseDir, this.sessionId);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    this.traceFilePath = path.join(sessionDir, `${this.runId}.jsonl`);
  }

  public recordEvent(type: string, payload: Record<string, unknown>): void {
    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      runId: this.runId,
      sessionId: this.sessionId,
      type,
      payload: redactSecrets(payload),
    };

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.traceFilePath, line, 'utf8');
  }

  private isActive: boolean = true;

  public attachToEventBus(eventBus: LoggingEventBus): void {
    // Record relevant events from eventBus
    const eventTypes = [
      'agent.loop.started',
      'agent.loop.turn.started',
      'model.request',
      'model.response',
      'message.delta',
      'approval.requested',
      'tool.call.started',
      'tool.call.completed',
      'verification.started',
      'verification.completed',
      'verification.failed',
      'patch.applied',
      'plan.created',
      'plan.revised',
      'agent.loop.completed',
    ];

    for (const evt of eventTypes) {
      eventBus.subscribe(evt, (event) => {
        if (!this.isActive) return;
        const payload = (event.payload as any) || {};
        const eventSessionId = payload.sessionId || event.sessionId;
        if (!eventSessionId || eventSessionId === this.sessionId) {
          this.recordEvent(evt, payload);
        }
      });
    }
  }

  public stop(): void {
    this.isActive = false;
  }

  public static findTraceFile(runId: string, searchRoot?: string): string | null {
    const root = searchRoot || path.resolve(process.cwd(), '.agentos', 'traces');
    if (!fs.existsSync(root)) return null;

    const findRecursive = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const res = findRecursive(fullPath);
          if (res) return res;
        } else if (entry.isFile() && (entry.name === `${runId}.jsonl` || entry.name.includes(runId))) {
          return fullPath;
        }
      }
      return null;
    };

    return findRecursive(root);
  }

  public static readTrace(traceFilePath: string): TraceEntry[] {
    if (!fs.existsSync(traceFilePath)) {
      return [];
    }
    const lines = fs
      .readFileSync(traceFilePath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((l) => JSON.parse(l));
  }

  public static exportMarkdown(entries: TraceEntry[]): string {
    if (entries.length === 0) {
      return '# Empty Trace\n\nNo trace entries recorded.\n';
    }

    const first = entries[0];
    const last = entries[entries.length - 1];

    const lines: string[] = [];
    lines.push(`# Execution Trace: ${first.runId}`);
    lines.push('');
    lines.push(`- **Session ID**: \`${first.sessionId}\``);
    lines.push(`- **Started At**: ${first.timestamp}`);
    lines.push(`- **Ended At**: ${last.timestamp}`);
    lines.push(`- **Total Events**: ${entries.length}`);
    lines.push('');

    // User prompt
    const startEvent = entries.find((e) => e.type === 'agent.loop.started');
    if (startEvent?.payload?.userInput) {
      lines.push('## User Input');
      lines.push('');
      lines.push('```markdown');
      lines.push(String(startEvent.payload.userInput));
      lines.push('```');
      lines.push('');
    }

    // Tool Calls Section
    lines.push('## Tool Executions');
    lines.push('');
    const toolStarts = entries.filter((e) => e.type === 'tool.call.started');
    const toolEnds = entries.filter((e) => e.type === 'tool.call.completed');
    const toolEndMap = new Map(toolEnds.map((e) => [String(e.payload?.toolCallId), e]));

    if (toolStarts.length === 0) {
      lines.push('No tool calls executed in this run.');
      lines.push('');
    } else {
      for (let i = 0; i < toolStarts.length; i++) {
        const start = toolStarts[i];
        const callId = String(start.payload?.toolCallId);
        const name = String(start.payload?.toolName);
        const args = JSON.stringify(start.payload?.args || {}, null, 2);
        const end = toolEndMap.get(callId);
        const result = end ? JSON.stringify(end.payload?.result ?? '', null, 2) : 'pending';

        lines.push(`### ${i + 1}. \`${name}\` (${callId})`);
        lines.push('');
        lines.push('**Arguments**:');
        lines.push('```json');
        lines.push(args);
        lines.push('```');
        lines.push('');
        lines.push('**Result**:');
        lines.push('```json');
        lines.push(result);
        lines.push('```');
        lines.push('');
      }
    }

    // Verification Section
    lines.push('## Verification');
    lines.push('');
    const verifEvents = entries.filter((e) => e.type.startsWith('verification.'));
    if (verifEvents.length === 0) {
      lines.push('No verification steps recorded.');
      lines.push('');
    } else {
      for (const v of verifEvents) {
        lines.push(`- **${v.type}** at \`${v.timestamp}\`:`);
        lines.push('```json');
        lines.push(JSON.stringify(v.payload, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    // Plan Section
    const planEvents = entries.filter((e) => e.type === 'plan.created' || e.type === 'plan.revised');
    if (planEvents.length > 0) {
      lines.push('## Planning');
      lines.push('');
      for (const p of planEvents) {
        lines.push(`### ${p.type === 'plan.created' ? 'Initial Plan' : 'Plan Revision'} at \`${p.timestamp}\``);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(p.payload?.plan || p.payload, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    // Final Summary Section
    const endEvent = entries.find((e) => e.type === 'agent.loop.completed');
    if (endEvent?.payload?.summary) {
      lines.push('## Final Summary');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(endEvent.payload.summary, null, 2));
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }
}
