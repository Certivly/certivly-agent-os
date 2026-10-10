import { todoStore, type TodoItem, type TodoStatus, type TodoPriority } from '@agent-os/tools';
import type { LoggingEventBus } from '@agent-os/shared';

export interface SessionTodoCounts {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  cancelled: number;
}

export class SessionTodoManager {
  constructor(private eventBus?: LoggingEventBus) {}

  public getTodos(sessionId: string): TodoItem[] {
    return todoStore.getTodos(sessionId);
  }

  public updateTodos(sessionId: string, todos: TodoItem[]): SessionTodoCounts {
    todoStore.setTodos(sessionId, todos);

    const counts: SessionTodoCounts = {
      total: todos.length,
      completed: todos.filter(t => t.status === 'completed').length,
      in_progress: todos.filter(t => t.status === 'in_progress').length,
      pending: todos.filter(t => t.status === 'pending').length,
      cancelled: todos.filter(t => t.status === 'cancelled').length,
    };

    if (this.eventBus) {
      this.eventBus.publish('todo.updated', {
        sessionId,
        todos,
        counts,
      });
    }

    return counts;
  }

  public clear(sessionId: string): void {
    todoStore.clear(sessionId);
  }

  public formatMarkdown(sessionId: string): string {
    return todoStore.formatMarkdown(sessionId);
  }

  public formatForPrompt(sessionId: string): string | null {
    const todos = this.getTodos(sessionId);
    if (todos.length === 0) return null;
    return this.formatMarkdown(sessionId);
  }
}

export const sessionTodoManager = new SessionTodoManager();
