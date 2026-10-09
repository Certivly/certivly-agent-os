import { describe, it, expect } from 'bun:test';
import { codeInterpreterTool } from '../src/implementations/code_interpreter';

describe('code_interpreter Tool (Qwen Code Sandboxed Evaluator)', () => {
  const ctx = { workspaceRoot: process.cwd() };

  it('1. evaluates arithmetic and console logs successfully', async () => {
    const result = await codeInterpreterTool.execute({
      code: `
        const a = 15;
        const b = 27;
        console.log("Sum:", a + b);
        return a + b;
      `,
    }, ctx);

    expect(result.isError).toBe(false);
    expect(result.content).toContain('Sum: 42');
    expect(result.content).toContain('42');
  });

  it('2. evaluates async logic and returns objects', async () => {
    const result = await codeInterpreterTool.execute({
      code: `
        const items = [1, 2, 3];
        const doubled = items.map(x => x * 2);
        return { items, doubled, total: doubled.reduce((a, b) => a + b, 0) };
      `,
    }, ctx);

    expect(result.isError).toBe(false);
    expect(result.content).toContain('"total": 12');
  });

  it('3. reports runtime errors and sets isError to true', async () => {
    const result = await codeInterpreterTool.execute({
      code: `
        throw new Error("Deliberate failure in sandbox");
      `,
    }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Deliberate failure in sandbox');
  });

  it('4. rejects empty code gracefully', async () => {
    const result = await codeInterpreterTool.execute({
      code: '   ',
    }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Code must be a non-empty string');
  });
});
