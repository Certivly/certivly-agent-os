import { describe, it, expect, beforeEach } from 'bun:test';
import { todoWriteTool, todoStore, type TodoItem } from '../src/implementations/todowrite';
import { ToolError } from '@agent-os/shared';

describe('todowrite Tool (OpenCode Structured Task Management)', () => {
  beforeEach(() => {
    todoStore.clear();
  });

  it('1. updates structured checklist with mixed statuses and priorities', async () => {
    const inputTodos: TodoItem[] = [
      { content: 'Explore codebase architecture', status: 'completed', priority: 'high' },
      { content: 'Implement ToolOutputStore', status: 'in_progress', priority: 'high' },
      { content: 'Write tests for todowrite tool', status: 'pending', priority: 'medium' },
      { content: 'Deprecate old bash script', status: 'cancelled', priority: 'low' },
    ];

    const result = await todoWriteTool.execute(
      { todos: inputTodos },
      { workspaceRoot: '/test/workspace' }
    );

    expect(result.success).toBe(true);
    expect(result.isError).toBe(false);
    expect(result.data?.counts.total).toBe(4);
    expect(result.data?.counts.completed).toBe(1);
    expect(result.data?.counts.in_progress).toBe(1);
    expect(result.data?.counts.pending).toBe(1);
    expect(result.data?.counts.cancelled).toBe(1);

    expect(result.content).toContain('Successfully updated 4 task(s)');
    expect(result.content).toContain('[x] Explore codebase architecture (high) [completed]');
    expect(result.content).toContain('[>] Implement ToolOutputStore (high) [in_progress]');
    expect(result.content).toContain('[ ] Write tests for todowrite tool (medium) [pending]');
    expect(result.content).toContain('[-] Deprecate old bash script (low) [cancelled]');
  });

  it('2. validates schema inputs and rejects invalid fields with helpful errors', async () => {
    // Non-array
    expect(
      todoWriteTool.execute({ todos: 'not-an-array' }, { workspaceRoot: '/test' })
    ).rejects.toThrow(/Parameter "todos" must be an array/);

    // Missing content
    expect(
      todoWriteTool.execute(
        { todos: [{ status: 'pending' }] },
        { workspaceRoot: '/test' }
      )
    ).rejects.toThrow(/missing required string property "content"/);

    // Invalid status
    expect(
      todoWriteTool.execute(
        { todos: [{ content: 'Test task', status: 'invalid_status' }] },
        { workspaceRoot: '/test' }
      )
    ).rejects.toThrow(/invalid status "invalid_status"/);

    // Invalid priority
    expect(
      todoWriteTool.execute(
        { todos: [{ content: 'Test task', status: 'pending', priority: 'ultra_critical' }] },
        { workspaceRoot: '/test' }
      )
    ).rejects.toThrow(/invalid priority "ultra_critical"/);
  });

  it('3. isolates todos by workspace scope', async () => {
    await todoWriteTool.execute(
      { todos: [{ content: 'Task in project A', status: 'pending' }] },
      { workspaceRoot: '/workspace/project-a' }
    );

    await todoWriteTool.execute(
      { todos: [{ content: 'Task in project B', status: 'completed' }] },
      { workspaceRoot: '/workspace/project-b' }
    );

    const todosA = todoStore.getTodos('/workspace/project-a');
    const todosB = todoStore.getTodos('/workspace/project-b');

    expect(todosA).toHaveLength(1);
    expect(todosA[0].content).toBe('Task in project A');

    expect(todosB).toHaveLength(1);
    expect(todosB[0].content).toBe('Task in project B');
  });

  it('4. exposes correct tool specifications for safe plan/build execution', () => {
    expect(todoWriteTool.spec.name).toBe('todowrite');
    expect(todoWriteTool.spec.readOnly).toBe(true);
    expect(todoWriteTool.requiresApproval({}, { workspaceRoot: '/test' })).toBe(false);
  });
});
