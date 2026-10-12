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

  it('5. handles template literals with backticks and interpolation without error', async () => {
    const result = await codeInterpreterTool.execute({
      code: 'const name = "AgentOS"; console.log(`Hello, ${name}!`); return `Welcome to ${name}`;',
    }, ctx);

    expect(result.isError).toBe(false);
    expect(result.content).toContain('Hello, AgentOS!');
    expect(result.content).toContain('Welcome to AgentOS');
  });

  it('6. respects AbortSignal and aborts immediately', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await codeInterpreterTool.execute(
      { code: 'console.log("should not run");' },
      { ...ctx, signal: controller.signal }
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain('aborted');
  });

  it('7. is marked readOnly: false and requires approval before executing', async () => {
    expect(codeInterpreterTool.spec.readOnly).toBe(false);
    expect(await codeInterpreterTool.requiresApproval({})).toBe(true);
  });
});
