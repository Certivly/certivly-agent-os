import { describe, it, expect } from 'bun:test';
import { ToolRegistry } from '../src/registry';
import type { WorkspaceTool } from '../src/types';

describe('Tool Contract and Registry (Action 2.01)', () => {
  const makeTool = (name: string, readOnly = true): WorkspaceTool => ({
    spec: {
      name,
      description: `Tool for ${name}`,
      parameters: { type: 'object', properties: { input: { type: 'string' } } },
      readOnly,
    },
    requiresApproval: () => !readOnly,
    execute: async (args) => ({ content: `Executed ${name}`, isError: false }),
  });

  it('registers and retrieves a tool', () => {
    const registry = new ToolRegistry();
    const tool = makeTool('read_file');
    registry.register(tool);

    const retrieved = registry.get('read_file');
    expect(retrieved).toBeDefined();
    expect(retrieved?.spec.name).toBe('read_file');
  });

  it('throws on duplicate tool registration', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('tool_a'));

    expect(() => registry.register(makeTool('tool_a'))).toThrow(
      /already registered/
    );
  });

  it('returns undefined for unknown tool name', () => {
    const registry = new ToolRegistry();
    expect(registry.get('missing_tool')).toBeUndefined();
  });

  it('returns a deterministic, sorted list of tools', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('zeta'));
    registry.register(makeTool('alpha'));
    registry.register(makeTool('gamma'));

    const list = registry.list();
    expect(list.map(t => t.spec.name)).toEqual(['alpha', 'gamma', 'zeta']);
  });

  it('includes schema and readOnly in provider tool specs', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('search', true));
    registry.register(makeTool('delete', false));

    const specs = registry.toProviderToolSpecs();
    expect(specs).toHaveLength(2);
    expect(specs[0].name).toBe('delete');
    expect(specs[0].readOnly).toBe(false);
    expect(specs[0].parameters).toBeDefined();

    expect(specs[1].name).toBe('search');
    expect(specs[1].readOnly).toBe(true);
    expect(specs[1].parameters).toBeDefined();
  });
});
