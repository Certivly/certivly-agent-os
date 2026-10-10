import { describe, it, expect, afterAll } from 'bun:test';
import { terminalInteractiveTool } from '../src/implementations/terminal_interactive';
import { TerminalSessionManager } from '@agent-os/sandbox';

describe('terminal_interactive Tool (Persistent Terminal Multiplexer)', () => {
  const manager = TerminalSessionManager.getInstance();

  afterAll(() => {
    manager.destroyAll();
  });

  it('declares valid ToolSpec schema', () => {
    expect(terminalInteractiveTool.spec.name).toBe('terminal_interactive');
    expect(terminalInteractiveTool.spec.readOnly).toBe(false);
    expect(terminalInteractiveTool.spec.parameters).toBeDefined();
  });

  it('rejects missing sessionId', async () => {
    const res = await terminalInteractiveTool.execute({ action: 'start' }, { workspaceRoot: process.cwd() });
    expect(res.isError).toBe(true);
    expect(res.content).toContain('sessionId');
  });

  it('starts session, sends input, captures screen, and stops session', async () => {
    const testSessionId = 'test-unit-term-session';

    // 1. Start
    const startRes = await terminalInteractiveTool.execute(
      { action: 'start', sessionId: testSessionId },
      { workspaceRoot: process.cwd() }
    );
    expect(startRes.isError).toBe(false);
    expect(startRes.content).toContain(`[Terminal Session "${testSessionId}" Started]`);

    // 2. Send command echo
    const sendRes = await terminalInteractiveTool.execute(
      { action: 'send', sessionId: testSessionId, input: 'echo HELLO_AGENT_OS' },
      { workspaceRoot: process.cwd() }
    );
    expect(sendRes.isError).toBe(false);

    // 3. Capture
    const capRes = await terminalInteractiveTool.execute(
      { action: 'capture', sessionId: testSessionId, maxLines: 10 },
      { workspaceRoot: process.cwd() }
    );
    expect(capRes.isError).toBe(false);
    expect(capRes.content).toContain('Screen Buffer');

    // 4. Stop
    const stopRes = await terminalInteractiveTool.execute(
      { action: 'stop', sessionId: testSessionId },
      { workspaceRoot: process.cwd() }
    );
    expect(stopRes.isError).toBe(false);
    expect(stopRes.content).toContain('Terminated');
  });
});
