import { describe, it, expect, beforeEach } from 'bun:test';
import { delegateSubagentTool, setSubagentDelegateHandler } from '../src/implementations/delegate_subagent';

describe('delegate_subagent tool', () => {
  beforeEach(() => {
    setSubagentDelegateHandler(null);
  });

  const mockContext = { workspaceRoot: '/test' };

  it('1. validates required arguments', async () => {
    const resNoAgent = await delegateSubagentTool.execute({ agentName: '', task: 'foo' }, mockContext);
    expect(resNoAgent.isError).toBe(true);
    expect(resNoAgent.content).toContain('agentName must be specified');

    const resNoTask = await delegateSubagentTool.execute({ agentName: 'explorer', task: '' }, mockContext);
    expect(resNoTask.isError).toBe(true);
    expect(resNoTask.content).toContain('task must be a non-empty string');
  });

  it('2. invokes activeDelegateHandler when configured', async () => {
    let invokedWith: any = null;
    setSubagentDelegateHandler(async (agentName, task, context) => {
      invokedWith = { agentName, task, context };
      return {
        content: `Subagent ${agentName} executed successfully: found 3 files.`,
        isError: false,
      };
    });

    const res = await delegateSubagentTool.execute({
      agentName: 'explorer',
      task: 'Locate authentication controllers',
      context: 'Look in src/auth',
    }, mockContext);

    expect(res.isError).toBe(false);
    expect(res.content).toContain('Subagent explorer executed successfully');
    expect(invokedWith).toEqual({
      agentName: 'explorer',
      task: 'Locate authentication controllers',
      context: 'Look in src/auth',
    });
  });

  it('3. falls back gracefully when handler throws', async () => {
    setSubagentDelegateHandler(async () => {
      throw new Error('Connection timeout to subagent isolated runner');
    });

    const res = await delegateSubagentTool.execute({
      agentName: 'coder',
      task: 'Write unit test',
    }, mockContext);

    expect(res.isError).toBe(true);
    expect(res.content).toContain('Subagent execution failed');
    expect(res.content).toContain('Connection timeout');
  });
});
