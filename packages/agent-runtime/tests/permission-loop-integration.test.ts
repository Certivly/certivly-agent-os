import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import type { LoopTool } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('PermissionLoopIntegration Tests (Action 5-01)', () => {
  const testDir = path.join(__dirname, '.tmp-permission-loop');
  let dbPath: string;

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    dbPath = path.join(testDir, `test-${crypto.randomUUID()}.db`);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('6. plan mode rejects edit_file call and returns [PermissionDenied] with file unchanged', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const targetFilePath = path.join(testDir, 'sample.txt');
    fs.writeFileSync(targetFilePath, 'initial content', 'utf8');

    let toolExecuted = false;
    const mockEditTool: LoopTool = {
      spec: {
        name: 'edit_file',
        description: 'Edit file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            oldText: { type: 'string' },
            newText: { type: 'string' },
          },
          required: ['path'],
        },
        readOnly: false,
      },
      requiresApproval: () => true,
      execute: async (args, signal, id = 'tc') => {
        toolExecuted = true;
        fs.writeFileSync(targetFilePath, 'modified content', 'utf8');
        return { toolCallId: id, name: 'edit_file', content: 'file edited', isError: false };
      },
    };

    const model = new ScriptedModel([
      {
        text: 'I will modify the file',
        toolCalls: [
          {
            id: 'call_edit',
            name: 'edit_file',
            args: JSON.stringify({ path: 'sample.txt', oldText: 'initial', newText: 'modified' }),
          },
        ],
      },
      {
        text: 'I see my edit was rejected due to permission mode.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [mockEditTool],
      history,
      eventBus,
      workspaceRoot: testDir,
      options: {
        permissionMode: 'plan',
        noReadGuard: true,
      },
    });

    const summary = await loop.run({
      sessionId: 'sess-plan-permission',
      userInput: 'Edit sample.txt',
      workspaceRoot: testDir,
    });

    expect(summary.success).toBe(true);
    expect(toolExecuted).toBe(false);

    // Verify file content is unchanged
    const diskContent = fs.readFileSync(targetFilePath, 'utf8');
    expect(diskContent).toBe('initial content');

    // Verify tool message content contains [PermissionDenied]
    const messages = await history.load('sess-plan-permission');
    const toolMsg = messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toContain('[PermissionDenied]');
    expect(toolMsg?.content).toContain("Mode 'plan' does not allow file edits");
  });

  it('auto mode allows safe run_command without requiring manual approval', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    let toolExecuted = false;
    const mockCommandTool: LoopTool = {
      spec: {
        name: 'run_command',
        description: 'Run command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
          required: ['command'],
        },
        readOnly: false,
      },
      requiresApproval: () => true, // default says requires approval
      execute: async (args, signal, id = 'tc') => {
        toolExecuted = true;
        return { toolCallId: id, name: 'run_command', content: 'Tests passed', isError: false };
      },
    };

    const model = new ScriptedModel([
      {
        text: 'Running safe test command',
        toolCalls: [
          {
            id: 'call_cmd',
            name: 'run_command',
            args: JSON.stringify({ command: 'bun test packages/agent-runtime' }),
          },
        ],
      },
      {
        text: 'All tests finished.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [mockCommandTool],
      history,
      eventBus,
      workspaceRoot: testDir,
      options: {
        permissionMode: 'auto',
      },
      // Note: NO requestApproval handler provided — if it asked, it would fail/deny
    });

    const summary = await loop.run({
      sessionId: 'sess-auto-permission',
      userInput: 'Run tests',
      workspaceRoot: testDir,
    });

    expect(summary.success).toBe(true);
    expect(toolExecuted).toBe(true);
  });
});
