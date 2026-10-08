import { describe, it, expect } from 'bun:test';
import { ToolRegistry } from '@agent-os/tools';
import { SearchSubagent } from '../src/loop/SearchSubagent';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('Action 5-06: Search Subagent (Read-Only)', () => {
  it('1. Allowed tools only: Confirm that edit_file is not in the restricted registry', () => {
    const registry = new ToolRegistry();
    registry.register({
      spec: { name: 'edit_file', description: 'edit', parameters: {}, readOnly: false },
      requiresApproval: () => true,
      execute: async () => ({ content: 'edited', isError: false }),
    });
    registry.register({
      spec: { name: 'read_file', description: 'read', parameters: {}, readOnly: true },
      requiresApproval: () => false,
      execute: async () => ({ content: 'contents', isError: false }),
    });
    registry.register({
      spec: { name: 'repo_map', description: 'map', parameters: {}, readOnly: true },
      requiresApproval: () => false,
      execute: async () => ({ content: 'map', isError: false }),
    });

    const model = new ScriptedModel([]);
    const subagent = new SearchSubagent(model, registry, process.cwd());
    const readOnlyReg = subagent.getReadOnlyRegistry();

    expect(readOnlyReg.get('edit_file')).toBeUndefined();
    expect(readOnlyReg.get('read_file')).toBeDefined();
    expect(readOnlyReg.get('repo_map')).toBeDefined();
  });

  it('2. Blocked tool call returns advisory: Script model to call edit_file and verify advisory returned', async () => {
    const registry = new ToolRegistry();
    registry.register({
      spec: { name: 'read_file', description: 'read', parameters: {}, readOnly: true },
      requiresApproval: () => false,
      execute: async () => ({ content: 'file content', isError: false }),
    });

    const model = new ScriptedModel([
      {
        text: 'I want to edit the file',
        toolCalls: [{ id: 'tc-edit', name: 'edit_file', args: { path: 'test.ts', content: 'foo' } }],
      },
      {
        text: 'I cannot edit files.',
      },
    ]);

    const subagent = new SearchSubagent(model, registry, process.cwd());
    const result = await subagent.search('modify config');

    const secondReq = model.requests[1];
    const toolMsg = secondReq.messages.find((m) => m.role === 'tool' && m.name === 'edit_file');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toContain('[SearchSubagent] Tool not permitted');
    expect(result.reason).toBeDefined();
  });

  it('3. Returns ranked files: Script model to call repo_map then return JSON with rankedFiles', async () => {
    const registry = new ToolRegistry();
    registry.register({
      spec: { name: 'repo_map', description: 'repo map', parameters: {}, readOnly: true },
      requiresApproval: () => false,
      execute: async () => ({ content: 'src/foo.ts\nsrc/bar.ts', isError: false }),
    });

    const model = new ScriptedModel([
      {
        text: 'Exploring repository',
        toolCalls: [{ id: 'tc-map', name: 'repo_map', args: { query: 'foo' } }],
      },
      {
        text: JSON.stringify({
          rankedFiles: ['src/foo.ts'],
          reason: 'matches query',
        }),
      },
    ]);

    const subagent = new SearchSubagent(model, registry, process.cwd());
    const result = await subagent.search('find foo');

    expect(result.rankedFiles).toContain('src/foo.ts');
    expect(result.reason).toBe('matches query');
    expect(result.turnsUsed).toBe(2);
  });

  it('4. Max turn cap: Script model to never return final answer; stops after 5 turns', async () => {
    const registry = new ToolRegistry();
    registry.register({
      spec: { name: 'list_dir', description: 'list dir', parameters: {}, readOnly: true },
      requiresApproval: () => false,
      execute: async () => ({ content: 'file1.ts\nfile2.ts', isError: false }),
    });

    const responses = Array.from({ length: 10 }, (_, i) => ({
      text: `Still exploring turn ${i + 1}`,
      toolCalls: [{ id: `tc-${i}`, name: 'list_dir', args: {} }],
    }));

    const model = new ScriptedModel(responses);
    const subagent = new SearchSubagent(model, registry, process.cwd());
    const result = await subagent.search('explore infinite');

    expect(result.turnsUsed).toBe(5);
    expect(model.callCount).toBe(5);
    expect(result.rankedFiles).toBeDefined();
  });
});
