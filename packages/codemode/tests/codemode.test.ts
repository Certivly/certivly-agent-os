import { describe, it, expect, beforeEach } from 'bun:test';
import { ToolCatalog } from '../src/catalog/ToolCatalog';
import { CodeModeInterpreter } from '../src/interpreter/CodeModeInterpreter';
import { CodeModeTool } from '../src/tool/CodeModeTool';
import type { WorkspaceTool, ToolContext, ToolResult } from '@agent-os/tools';

describe('CodeMode Programmatic Tool Orchestration (OpenCode Pattern)', () => {
  let catalog: ToolCatalog;
  let interpreter: CodeModeInterpreter;

  const mockReadFile: WorkspaceTool = {
    spec: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      readOnly: true,
    },
    requiresApproval: () => false,
    execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const p = String(args.path);
      if (p.endsWith('.json')) {
        return { content: JSON.stringify({ filename: p, items: [1, 2, 3] }), isError: false };
      }
      return { content: `Content of file ${p}`, isError: false };
    },
  };

  const mockListFiles: WorkspaceTool = {
    spec: {
      name: 'list_files',
      description: 'List files in workspace',
      parameters: {
        type: 'object',
        properties: { dir: { type: 'string' } },
      },
      readOnly: true,
    },
    requiresApproval: () => false,
    execute: async (): Promise<ToolResult> => {
      const files = ['src/a.ts', 'src/b.ts', 'src/data.json', 'package.json'];
      return { content: JSON.stringify(files), isError: false, data: files };
    },
  };

  beforeEach(() => {
    catalog = new ToolCatalog([mockReadFile, mockListFiles]);
    interpreter = new CodeModeInterpreter(catalog);
  });

  it('1. executes pure JavaScript logic and returns computed object', async () => {
    const code = `
      const numbers = [10, 20, 30, 40];
      const sum = numbers.reduce((acc, n) => acc + n, 0);
      return { sum, average: sum / numbers.length };
    `;

    const result = await interpreter.execute(code);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ sum: 100, average: 25 });
  });

  it('2. orchestrates multiple dependent tool calls and keeps intermediate data in sandbox', async () => {
    const code = `
      const files = await tools.list_files();
      const tsFiles = files.filter(f => f.endsWith('.ts'));

      const fileContents = await Promise.all(
        tsFiles.map(f => tools.read_file({ path: f }))
      );

      return {
        totalFiles: files.length,
        tsCount: tsFiles.length,
        firstContent: fileContents[0]
      };
    `;

    const result = await interpreter.execute(code);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      totalFiles: 4,
      tsCount: 2,
      firstContent: 'Content of file src/a.ts',
    });
    expect(result.toolCalls.length).toBe(3); // 1 list_files + 2 read_file
  });

  it('3. searches tool catalog dynamically via $codemode.search', async () => {
    const code = `
      const searchResult = $codemode.search('read');
      return {
        matched: searchResult.tools.map(t => t.name)
      };
    `;

    const result = await interpreter.execute(code);
    expect(result.ok).toBe(true);
    expect((result.value as any).matched).toContain('read_file');
  });

  it('4. enforces security boundaries and rejects eval, Function, process, require', async () => {
    const evalAttempt = await interpreter.execute('eval("2 + 2")');
    expect(evalAttempt.ok).toBe(false);
    expect(evalAttempt.error?.kind).toBe('UnsupportedSyntax');

    const procAttempt = await interpreter.execute('return process.env');
    expect(procAttempt.ok).toBe(false);
    expect(procAttempt.error?.kind).toBe('UnsupportedSyntax');

    const reqAttempt = await interpreter.execute('require("fs")');
    expect(reqAttempt.ok).toBe(false);
    expect(reqAttempt.error?.kind).toBe('UnsupportedSyntax');
  });

  it('5. enforces execution timeout on infinite loops', async () => {
    const code = `
      while (true) {}
    `;

    const result = await interpreter.execute(code, undefined, { timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('TimeoutExceeded');
  });

  it('6. enforces max tool calls quota per execution', async () => {
    const code = `
      await tools.read_file({ path: '1' });
      await tools.read_file({ path: '2' });
      await tools.read_file({ path: '3' });
    `;

    const result = await interpreter.execute(code, undefined, { maxToolCalls: 2 });
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('ToolCallLimitExceeded');
  });

  it('7. captures console.log outputs in result', async () => {
    const code = `
      console.log('Step 1: starting');
      console.log('Step 2: completed');
      return 'done';
    `;

    const result = await interpreter.execute(code);
    expect(result.ok).toBe(true);
    expect(result.logs).toContain('Step 1: starting');
    expect(result.logs).toContain('Step 2: completed');
  });

  it('8. executes end-to-end via CodeModeTool WorkspaceTool interface', async () => {
    const tool = new CodeModeTool(catalog);
    expect(tool.spec.name).toBe('execute');

    const toolResult = await tool.execute(
      { code: 'const f = await tools.list_files(); return { count: f.length };' },
      { workspaceRoot: '/test' }
    );

    expect(toolResult.isError).toBe(false);
    expect(toolResult.success).toBe(true);
    expect(toolResult.content).toContain('"count": 4');
  });
});
