import { describe, it, expect } from 'bun:test';
import { SubagentRunner } from '../src/multiagent/SubagentRunner';
import type { SubagentDefinition } from '../src/multiagent/SubagentModel';
import { ToolRegistry } from '@agent-os/tools';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('SubagentRunner (Isolated Subagent Execution)', () => {
  it('1. executes subagent and returns structured result', async () => {
    const fakeModel = new ScriptedModel([
      {
        text: 'Found 2 matching files in src/auth.',
      },
    ]);

    const toolReg = new ToolRegistry();
    const runner = new SubagentRunner(fakeModel, toolReg);

    const explorerDef: SubagentDefinition = {
      name: 'explorer',
      description: 'Explorer subagent',
      role: 'explorer',
      tools: ['read_file'],
      systemPrompt: 'Explore files',
    };

    const res = await runner.runSubagent(explorerDef, 'Find auth files');
    expect(res.success).toBe(true);
    expect(res.agentName).toBe('explorer');
    expect(res.finalText).toContain('Found 2 matching files');
    expect(res.turnsUsed).toBe(1);
  });

  it('2. blocks tools not in subagent whitelist', async () => {
    // Model attempts to call edit_file, but explorer only permits read_file
    const fakeModel = new ScriptedModel([
      {
        text: 'Attempting to edit file...',
        toolCalls: [
          {
            id: 'call-unauthorized-edit',
            name: 'edit_file',
            args: JSON.stringify({ path: 'src/secret.ts', oldText: 'a', newText: 'b' }),
          },
        ],
      },
      {
        text: 'Understood. Editing is forbidden.',
      },
    ]);

    const toolReg = new ToolRegistry();
    // Register edit_file in base registry so it exists in base
    toolReg.register({
      spec: { name: 'edit_file', description: 'edit', parameters: {}, readOnly: false },
      requiresApproval: () => false,
      execute: async () => ({ content: 'edited', isError: false }),
    });

    const runner = new SubagentRunner(fakeModel, toolReg);

    const explorerDef: SubagentDefinition = {
      name: 'explorer',
      description: 'Explorer subagent',
      role: 'explorer',
      tools: ['read_file'], // edit_file is NOT in whitelist!
      systemPrompt: 'Explore only',
    };

    const res = await runner.runSubagent(explorerDef, 'Inspect secret');
    expect(res.toolsExecuted).toContain('edit_file');
    expect(res.errors.some(e => e.includes('blocked by subagent policy'))).toBe(true);
  });

  it('3. executes permitted tools and tracks inspected files', async () => {
    const fakeModel = new ScriptedModel([
      {
        text: 'Reading file...',
        toolCalls: [
          {
            id: 'call-read-file',
            name: 'read_file',
            args: JSON.stringify({ path: 'src/math.ts' }),
          },
        ],
      },
      {
        text: 'File inspected: add function defined.',
      },
    ]);

    const toolReg = new ToolRegistry();
    toolReg.register({
      spec: { name: 'read_file', description: 'read', parameters: {}, readOnly: true },
      requiresApproval: () => false,
      execute: async () => ({ content: 'export function add() {}', isError: false }),
    });

    const runner = new SubagentRunner(fakeModel, toolReg);

    const explorerDef: SubagentDefinition = {
      name: 'explorer',
      description: 'Explorer subagent',
      role: 'explorer',
      tools: ['read_file'],
      systemPrompt: 'Explore files',
    };

    const res = await runner.runSubagent(explorerDef, 'Check math');
    expect(res.success).toBe(true);
    expect(res.toolsExecuted).toEqual(['read_file']);
    expect(res.filesInspected).toContain('src/math.ts');
    expect(res.finalText).toContain('add function defined');
  });
});
