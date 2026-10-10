import { describe, it, expect, afterEach } from 'bun:test';
import { TerminalSessionManager } from '../src/terminal/TerminalSessionManager';

describe('TerminalSessionManager (Freebuff Persistent Interactive Multiplexer Pattern)', () => {
  const manager = new TerminalSessionManager();

  afterEach(() => {
    manager.destroyAll();
  });

  it('1. creates interactive session, sends input, and captures output in buffer', async () => {
    const session = manager.createSession({
      id: 'test-repl-1',
      cwd: process.cwd(),
    });

    expect(session.isAlive).toBe(true);

    // Send simple echo command
    await manager.send('test-repl-1', 'echo HELLO_AGENT_OS_TERMINAL');
    const isIdle = await manager.waitIdle('test-repl-1', { maxWaitMs: 3000, idleStabilityMs: 200 });

    expect(isIdle).toBe(true);

    const capture = manager.captureScreen('test-repl-1', 40);
    expect(capture.screenText).toContain('HELLO_AGENT_OS_TERMINAL');
    expect(capture.totalLines).toBeGreaterThan(0);
  });

  it('2. destroys session cleanly', () => {
    manager.createSession({
      id: 'test-repl-2',
      cwd: process.cwd(),
    });

    expect(manager.getSession('test-repl-2')?.isAlive).toBe(true);
    manager.destroySession('test-repl-2');
    expect(manager.getSession('test-repl-2')).toBeUndefined();
  });
});
