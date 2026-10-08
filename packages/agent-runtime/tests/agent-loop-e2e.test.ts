import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import {
  readFileTool,
  editFileTool,
  runCommandTool,
  commandPolicyEngine,
} from '@agent-os/tools';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import { AdaptedLoopTool } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('Scripted End-To-End Read/Edit/Test Cycle (Action 2.05)', () => {
  const tempFixtureDir = path.join(__dirname, '.tmp-e2e-fixture-' + Date.now());
  let dbPath: string;

  beforeEach(() => {
    if (fs.existsSync(tempFixtureDir)) {
      fs.rmSync(tempFixtureDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(tempFixtureDir, 'src'), { recursive: true });

    dbPath = path.join(tempFixtureDir, `session-${crypto.randomUUID()}.db`);

    // 1. package.json
    fs.writeFileSync(
      path.join(tempFixtureDir, 'package.json'),
      JSON.stringify({
        name: 'math-e2e-fixture',
        version: '1.0.0',
        scripts: {
          test: 'bun test',
        },
      }, null, 2)
    );

    // 2. src/math.ts with initial bug
    fs.writeFileSync(
      path.join(tempFixtureDir, 'src', 'math.ts'),
      `export function add(a: number, b: number): number {\n  return a - b;\n}\n`
    );

    // 3. src/math.test.ts expecting 2 + 3 === 5
    fs.writeFileSync(
      path.join(tempFixtureDir, 'src', 'math.test.ts'),
      `import { describe, it, expect } from 'bun:test';\nimport { add } from './math';\n\ndescribe('math', () => {\n  it('adds two numbers', () => {\n    expect(add(2, 3)).toBe(5);\n  });\n});\n`
    );

    commandPolicyEngine.setMode('workspace-write');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempFixtureDir)) {
        fs.rmSync(tempFixtureDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('completes the scripted read/edit/test cycle autonomously with real tools', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const emittedEvents: Array<{ type: string; payload: any }> = [];

    eventBus.subscribe('*', (ev) => {
      emittedEvents.push({ type: ev.type, payload: ev.payload });
    });

    // Real production workspace tools wrapped by AdaptedLoopTool
    const realReadFile = new AdaptedLoopTool(readFileTool, {
      workspaceRoot: tempFixtureDir,
    });
    const realEditFile = new AdaptedLoopTool(editFileTool, {
      workspaceRoot: tempFixtureDir,
    });
    const realRunCommand = new AdaptedLoopTool(runCommandTool, {
      workspaceRoot: tempFixtureDir,
    });

    // Scripted model flow:
    // 1. Request real read_file for src/math.ts
    // 2. Request real edit_file to replace return a - b; with return a + b;
    // 3. Request real run_command for bun test
    // 4. Return natural language final answer
    const model = new ScriptedModel([
      {
        text: 'I will read src/math.ts to understand the implementation.',
        toolCalls: [
          {
            id: 'call-1-read',
            name: 'read_file',
            args: JSON.stringify({ path: 'src/math.ts' }),
          },
        ],
      },
      {
        text: 'I found the bug: addition is implemented as subtraction. I will fix it now.',
        toolCalls: [
          {
            id: 'call-2-edit',
            name: 'edit_file',
            args: JSON.stringify({
              path: 'src/math.ts',
              oldText: 'return a - b;',
              newText: 'return a + b;',
            }),
          },
        ],
      },
      {
        text: 'Now I will run the test suite to verify the fix.',
        toolCalls: [
          {
            id: 'call-3-test',
            name: 'run_command',
            args: JSON.stringify({ command: 'bun test' }),
          },
        ],
      },
      {
        text: 'I have fixed the bug in src/math.ts by changing subtraction to addition. All unit tests now pass successfully.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [realReadFile, realEditFile, realRunCommand],
      history,
      eventBus,
      workspaceRoot: tempFixtureDir,
      requestApproval: async () => ({ approved: true }),
    });

    const summary = await loop.run({
      sessionId: 'sess-e2e-cycle-real',
      userInput: 'Fix the bug in src/math.ts and verify tests pass',
      workspaceRoot: tempFixtureDir,
    });

    // 1. Assert real read_file was called and read source
    const readCall = summary.toolCalls.find(tc => tc.name === 'read_file');
    expect(readCall).toBeDefined();
    expect(readCall?.success).toBe(true);

    // 2. Assert real edit_file fixed the bug in math.ts
    const editCall = summary.toolCalls.find(tc => tc.name === 'edit_file');
    expect(editCall).toBeDefined();
    expect(editCall?.success).toBe(true);
    const mathContent = fs.readFileSync(path.join(tempFixtureDir, 'src', 'math.ts'), 'utf8');
    expect(mathContent).toContain('return a + b;');
    expect(mathContent).not.toContain('return a - b;');

    // 3. Assert real run_command executed test
    const cmdCall = summary.toolCalls.find(tc => tc.name === 'run_command');
    expect(cmdCall).toBeDefined();
    expect(cmdCall?.success).toBe(true);

    // 4. Assert summary lists changed file
    expect(summary.filesChanged).toContain('src/math.ts');

    // 5. Assert summary lists command
    expect(summary.commands.length).toBeGreaterThan(0);
    const testCmd = summary.commands.find(c => c.command.includes('bun test'));
    expect(testCmd).toBeDefined();
    expect(testCmd?.exitCode).toBe(0);

    // 6. Assert final reply is natural language
    expect(summary.success).toBe(true);
    expect(summary.errors).toHaveLength(0);
    expect(summary.finalText).toBe(
      'I have fixed the bug in src/math.ts by changing subtraction to addition. All unit tests now pass successfully.'
    );
    expect(summary.finalText.trim().startsWith('{')).toBe(false);

    // Verify model requests and tool results in history
    expect(model.requests.length).toBe(4);
    const historyMessages = await history.load('sess-e2e-cycle-real');
    const toolResults = historyMessages.filter(m => m.role === 'tool');
    expect(toolResults.length).toBe(3);

    // Verify real read_file returned line numbers
    const readHistory = toolResults.find(tr => tr.name === 'read_file');
    expect(readHistory?.content).toContain('1 |');

    // Verify events were emitted
    const toolNamesStarted = emittedEvents
      .filter(e => e.type === 'tool.call.started')
      .map(e => e.payload.toolName);
    expect(toolNamesStarted).toEqual(['read_file', 'edit_file', 'run_command']);
  });
});
