import { describe, it, expect } from 'bun:test';
import React from 'react';
import { Writable } from 'stream';
import { render } from 'ink';
import { CommandPalette } from '../src/ui/components/CommandPalette';
import { TodoPanel } from '../src/ui/components/TodoPanel';
import { StatusBar } from '../src/ui/components/StatusBar';
import type { TodoItem } from '../src/ui/hooks/useEventStream';

function renderComponent(element: React.ReactElement): Promise<string> {
  return new Promise((resolve) => {
    let output = '';
    const stream = new Writable({
      write(chunk, _enc, cb) {
        output += chunk.toString();
        cb();
      },
    });
    // @ts-ignore
    stream.columns = 100;
    // @ts-ignore
    stream.rows = 30;

    const instance = render(element, { stdout: stream as any, debug: true });
    setTimeout(() => {
      instance.unmount();
      instance.cleanup();
      resolve(output);
    }, 60);
  });
}

describe('CLI UI Components (OpenCode & Freebuff Patterns)', () => {
  it('1. CommandPalette renders matching commands and highlights selected index', async () => {
    const frame = await renderComponent(
      <CommandPalette query="/plan" selectedIndex={0} maxVisible={5} />
    );
    expect(frame).toContain('Slash Commands');
    expect(frame).toContain('/plan');
    expect(frame).toContain('Switch to Plan mode');
  });

  it('2. CommandPalette handles empty matches gracefully', async () => {
    const frame = await renderComponent(
      <CommandPalette query="/nonexistent123" selectedIndex={0} />
    );
    expect(frame).toContain('No matching slash commands');
  });

  it('3. TodoPanel renders task checklist, status icons, and completion metrics', async () => {
    const sampleTodos: TodoItem[] = [
      { id: '1', title: 'Explore codebase architecture', status: 'completed' },
      { id: '2', title: 'Implement mutex lock', status: 'in_progress', priority: 'high' },
      { id: '3', title: 'Verify race conditions', status: 'pending' },
    ];

    const frame = await renderComponent(
      <TodoPanel todos={sampleTodos} collapsed={false} />
    );
    expect(frame).toContain('Tasks & Progress');
    expect(frame).toContain('1/3 completed');
    expect(frame).toContain('[✓] 1. Explore codebase architecture');
    expect(frame).toContain('[●] 2. Implement mutex lock');
    expect(frame).toContain('[HIGH]');
    expect(frame).toContain('[ ] 3. Verify race conditions');
  });

  it('4. TodoPanel collapsed state renders compact single-line badge', async () => {
    const sampleTodos: TodoItem[] = [
      { id: '1', title: 'Task one', status: 'completed' },
      { id: '2', title: 'Task two', status: 'pending' },
    ];

    const frame = await renderComponent(
      <TodoPanel todos={sampleTodos} collapsed={true} />
    );
    expect(frame).toContain('1/2 done (50%)');
    expect(frame).toContain('Ctrl+T to expand');
  });

  it('5. StatusBar renders rich aesthetic badges for mode, model, and todos', async () => {
    const frame = await renderComponent(
      <StatusBar
        sessionId="sess-test"
        mode="manual"
        modelId="claude-3-5-sonnet"
        todosCount={{ completed: 2, total: 3 }}
        mcpCount={4}
      />
    );
    expect(frame).toContain('[BUILD]');
    expect(frame).toContain('claude-3-5-sonnet');
    expect(frame).toContain('2/3 tasks');
    expect(frame).toContain('MCP: 4');
  });
});
