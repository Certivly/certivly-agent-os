import { Tool } from '../interface';
import { ToolError } from '@agent-os/shared';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TodoPriority = 'high' | 'medium' | 'low';

export interface TodoItem {
  id?: string;
  content: string;
  status: TodoStatus;
  priority?: TodoPriority;
}

export class TodoStore {
  private static instance: TodoStore;
  // Keyed by sessionId or workspaceRoot
  private todosByScope: Map<string, TodoItem[]> = new Map();

  public static getInstance(): TodoStore {
    if (!TodoStore.instance) {
      TodoStore.instance = new TodoStore();
    }
    return TodoStore.instance;
  }

  public getTodos(scope: string = 'default'): TodoItem[] {
    return this.todosByScope.get(scope) ? [...this.todosByScope.get(scope)!] : [];
  }

  public setTodos(scope: string = 'default', todos: TodoItem[]): void {
    this.todosByScope.set(scope, [...todos]);
  }

  public clear(scope?: string): void {
    if (scope) {
      this.todosByScope.delete(scope);
    } else {
      this.todosByScope.clear();
    }
  }

  public formatMarkdown(scope: string = 'default'): string {
    const todos = this.getTodos(scope);
    if (todos.length === 0) return 'No active tasks.';

    const lines: string[] = ['### Task Checklist'];
    for (const todo of todos) {
      let icon = '[ ]';
      if (todo.status === 'completed') icon = '[x]';
      else if (todo.status === 'in_progress') icon = '[>]';
      else if (todo.status === 'cancelled') icon = '[-]';

      const prio = todo.priority ? ` (${todo.priority})` : '';
      lines.push(`${icon} ${todo.content}${prio} [${todo.status}]`);
    }
    return lines.join('\n');
  }
}

export const todoStore = TodoStore.getInstance();

export const todoWriteTool: WorkspaceTool & Tool = {
  name: 'todowrite',
  description: 'Create and maintain a structured task list for the current session. Use it to track progress during multi-step work and keep todo statuses current.',
  spec: {
    name: 'todowrite',
    description: 'Create and update a structured task checklist with status (pending, in_progress, completed, cancelled) and priority (high, medium, low).',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The updated list of tasks/todos for this session',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Optional unique task identifier' },
              content: { type: 'string', description: 'Brief description of the task' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                description: 'Current status of the task',
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Priority level of the task (default: medium)',
              },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const rawTodos = args.todos;
    if (!Array.isArray(rawTodos)) {
      throw new ToolError('Parameter "todos" must be an array of task objects');
    }

    const validatedTodos: TodoItem[] = [];
    const validStatuses = new Set<TodoStatus>(['pending', 'in_progress', 'completed', 'cancelled']);
    const validPriorities = new Set<TodoPriority>(['high', 'medium', 'low']);

    for (let i = 0; i < rawTodos.length; i++) {
      const item = rawTodos[i];
      if (!item || typeof item !== 'object') {
        throw new ToolError(`Item at index ${i} must be an object`);
      }
      const content = String(item.content || '').trim();
      if (!content) {
        throw new ToolError(`Item at index ${i} missing required string property "content"`);
      }
      const status = String(item.status || 'pending').toLowerCase() as TodoStatus;
      if (!validStatuses.has(status)) {
        throw new ToolError(`Item at index ${i} has invalid status "${item.status}". Must be one of: pending, in_progress, completed, cancelled`);
      }
      const priority = item.priority ? (String(item.priority).toLowerCase() as TodoPriority) : 'medium';
      if (!validPriorities.has(priority)) {
        throw new ToolError(`Item at index ${i} has invalid priority "${item.priority}". Must be one of: high, medium, low`);
      }

      validatedTodos.push({
        id: item.id ? String(item.id) : `task_${i + 1}`,
        content,
        status,
        priority,
      });
    }

    const scope = context?.workspaceRoot || 'default';
    todoStore.setTodos(scope, validatedTodos);

    const counts = {
      total: validatedTodos.length,
      completed: validatedTodos.filter(t => t.status === 'completed').length,
      in_progress: validatedTodos.filter(t => t.status === 'in_progress').length,
      pending: validatedTodos.filter(t => t.status === 'pending').length,
      cancelled: validatedTodos.filter(t => t.status === 'cancelled').length,
    };

    const formatted = todoStore.formatMarkdown(scope);
    const content = `Successfully updated ${counts.total} task(s) (${counts.completed} completed, ${counts.in_progress} in progress, ${counts.pending} pending, ${counts.cancelled} cancelled):\n\n${formatted}`;

    return Object.assign(
      {
        success: true,
        content,
        isError: false,
        data: {
          todos: validatedTodos,
          counts,
        },
      },
      { toString: () => content }
    );
  },
};
