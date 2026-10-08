import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { AgentLoop } from '../src/loop/AgentLoop';
import { SessionHistory } from '../src/loop/SessionHistory';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import type { Model } from '@agent-os/providers';

function walkTsFiles(dir: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'archive' ||
      entry.name.startsWith('.')
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkTsFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      result.push(full);
    }
  }
  return result;
}

describe('Action 6-14: Fail-Loud Error Handling and Zero Empty-Catch Policy', () => {
  it('1. static check: zero empty catch blocks in production src files', () => {
    const workspaceRoot = path.resolve(__dirname, '../../..');
    const packagesSrc = walkTsFiles(path.join(workspaceRoot, 'packages')).filter(f => f.includes(`${path.sep}src${path.sep}`));
    const appsSrc = walkTsFiles(path.join(workspaceRoot, 'apps')).filter(f => f.includes(`${path.sep}src${path.sep}`));
    const allSrcFiles = [...packagesSrc, ...appsSrc];

    expect(allSrcFiles.length).toBeGreaterThan(50);

    const violations: Array<{ file: string; line: number; text: string }> = [];
    const emptyCatchRegex = /catch\s*(\([^)]*\))?\s*\{\s*\}/;

    for (const file of allSrcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (emptyCatchRegex.test(lines[i])) {
          violations.push({
            file: path.relative(workspaceRoot, file),
            line: i + 1,
            text: lines[i].trim(),
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('2. runtime check: tool approval check failure defaults safely to requiring approval', async () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.agentos', 'test-failloud-'));
    try {
      const sessionManager = new SessionManager(path.join(tempDir, 'sessions.db'));
      sessionManager.createSession('sess-fail-loud');
      const history = new SessionHistory(sessionManager);
      const eventBus = new LoggingEventBus();

      let requestedApproval = false;
      const fakeModel: Model = {
        id: 'fake-fl',
        async generate() {
          return {
            text: 'calling risky tool',
            toolCalls: [{ id: 'tc-fl-1', name: 'flaky_tool', args: '{}' }],
          };
        },
      };

      const loop = new AgentLoop({
        model: fakeModel,
        history,
        eventBus,
        workspaceRoot: tempDir,
        options: { maxTurns: 1 },
        tools: [
          {
            spec: {
              name: 'flaky_tool',
              description: 'tool whose requiresApproval throws',
              parameters: {},
              readOnly: false,
            },
            requiresApproval() {
              throw new Error('Approval check calculation failed');
            },
            async execute() {
              return { toolCallId: 'tc-fl-1', name: 'flaky_tool', content: 'executed', isError: false };
            },
          },
        ],
        requestApproval: async () => {
          requestedApproval = true;
          return { approved: false, reason: 'safely blocked' };
        },
      });

      const summary = await loop.run({
        sessionId: 'sess-fail-loud',
        userInput: 'run flaky tool',
        workspaceRoot: tempDir,
      });

      // The tool must have requested approval because it failed safe instead of false
      expect(requestedApproval).toBe(true);
      expect(summary.toolCalls.length).toBe(1);
      expect(summary.toolCalls[0].success).toBe(false);
      sessionManager.close();
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // test cleanup
      }
    }
  });
});
