import { describe, it, expect, beforeEach } from 'bun:test';
import { SessionTodoManager } from '../src/loop/SessionTodoManager';
import { LoggingEventBus } from '@agent-os/shared';

describe('SessionTodoManager (OpenCode Session Task Tracking)', () => {
  let eventBus: LoggingEventBus;
  let manager: SessionTodoManager;

  beforeEach(() => {
    eventBus = new LoggingEventBus();
    manager = new SessionTodoManager(eventBus);
  });

  it('1. tracks and updates todos per session, emitting event with counts', () => {
    let capturedEvent: any = null;
    eventBus.subscribe('todo.updated', (event) => {
      capturedEvent = event;
    });

    const sessionId = 'session_123';
    const counts = manager.updateTodos(sessionId, [
      { content: 'Inspect repo structure', status: 'completed', priority: 'high' },
      { content: 'Write integration tests', status: 'in_progress', priority: 'medium' },
      { content: 'Deploy package', status: 'pending', priority: 'low' },
    ]);

    expect(counts.total).toBe(3);
    expect(counts.completed).toBe(1);
    expect(counts.in_progress).toBe(1);
    expect(counts.pending).toBe(1);

    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent.payload.sessionId).toBe(sessionId);
    expect(capturedEvent.payload.counts.total).toBe(3);
  });

  it('2. formats prompt hints when todos exist and returns null when empty', () => {
    const sessionId = 'session_empty';
    manager.clear(sessionId);
    expect(manager.formatForPrompt(sessionId)).toBeNull();

    manager.updateTodos(sessionId, [
      { content: 'Audit permissions', status: 'in_progress' },
    ]);

    const formatted = manager.formatForPrompt(sessionId);
    expect(formatted).not.toBeNull();
    expect(formatted).toContain('### Task Checklist');
    expect(formatted).toContain('[>] Audit permissions');
  });

  it('3. isolates tasks across different sessions', () => {
    manager.updateTodos('sess_A', [{ content: 'Work on A', status: 'pending' }]);
    manager.updateTodos('sess_B', [{ content: 'Work on B', status: 'completed' }]);

    const todosA = manager.getTodos('sess_A');
    const todosB = manager.getTodos('sess_B');

    expect(todosA[0].content).toBe('Work on A');
    expect(todosB[0].content).toBe('Work on B');
  });
});
