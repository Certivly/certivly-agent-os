import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { LoggingEventBus } from '@agent-os/shared';
import { RunTracer, redactSecrets } from '../src/trace/RunTracer';

describe('Action 3.04: Run Traces and Redaction', () => {
  const tempTracesDir = path.join(process.cwd(), 'temp-traces-test-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tempTracesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempTracesDir, { recursive: true, force: true });
  });

  it('1. trace file is written and records events in order', () => {
    const tracer = new RunTracer({
      sessionId: 'sess-123',
      runId: 'run-abc',
      tracesDir: tempTracesDir,
    });

    tracer.recordEvent('user.message', { content: 'Please fix the bug' });
    tracer.recordEvent('tool.call.started', {
      toolName: 'read_file',
      args: { path: 'src/main.ts' },
    });
    tracer.recordEvent('tool.call.completed', {
      toolName: 'read_file',
      result: 'function main() {}',
    });
    tracer.recordEvent('agent.loop.completed', { success: true });

    expect(fs.existsSync(tracer.traceFilePath)).toBe(true);

    const entries = RunTracer.readTrace(tracer.traceFilePath);
    expect(entries.length).toBe(4);
    expect(entries[0].type).toBe('user.message');
    expect(entries[1].type).toBe('tool.call.started');
    expect(entries[2].type).toBe('tool.call.completed');
    expect(entries[3].type).toBe('agent.loop.completed');

    expect(entries[0].sessionId).toBe('sess-123');
    expect(entries[0].runId).toBe('run-abc');
  });

  it('2. event bus integration captures published events', async () => {
    const eventBus = new LoggingEventBus();
    const tracer = new RunTracer({
      sessionId: 'sess-bus',
      runId: 'run-bus',
      tracesDir: tempTracesDir,
    });
    tracer.attachToEventBus(eventBus);

    eventBus.publish('agent.loop.started', {
      sessionId: 'sess-bus',
      userInput: 'Implement feature X',
    });

    eventBus.publish('tool.call.started', {
      sessionId: 'sess-bus',
      toolCallId: 'call-1',
      toolName: 'edit_file',
      args: { path: 'a.ts' },
    });

    // Wait a tick for async handlers
    await new Promise((r) => setTimeout(r, 20));

    tracer.stop();

    const entries = RunTracer.readTrace(tracer.traceFilePath);
    expect(entries.length).toBe(2);
    expect(entries[0].type).toBe('agent.loop.started');
    expect(entries[1].type).toBe('tool.call.started');
  });

  it('3. secrets are redacted from payloads', () => {
    const sensitivePayload = {
      apiKey: 'sk-1234567890abcdef1234567890',
      token: 'ghp_1234567890abcdef1234567890',
      authorization: 'Bearer secret_token_xyz',
      nested: {
        password: 'my-super-secret-password',
        rawText: 'Authorization: Bearer my_secret_token_123 and key sk-99887766554433221100aa',
      },
    };

    const redacted = redactSecrets(sensitivePayload);

    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.nested.password).toBe('[REDACTED]');
    expect(redacted.nested.rawText).not.toContain('my_secret_token_123');
    expect(redacted.nested.rawText).not.toContain('sk-99887766554433221100aa');
    expect(redacted.nested.rawText).toContain('[REDACTED_SECRET]');
  });

  it('4. markdown export contains tool and verification sections', () => {
    const entries = [
      {
        timestamp: '2026-10-02T00:00:00.000Z',
        runId: 'run-test',
        sessionId: 'sess-test',
        type: 'agent.loop.started',
        payload: { userInput: 'Fix bug in math.ts' },
      },
      {
        timestamp: '2026-10-02T00:00:01.000Z',
        runId: 'run-test',
        sessionId: 'sess-test',
        type: 'tool.call.started',
        payload: {
          toolCallId: 'call-1',
          toolName: 'edit_file',
          args: { path: 'math.ts', oldText: '1', newText: '2' },
        },
      },
      {
        timestamp: '2026-10-02T00:00:02.000Z',
        runId: 'run-test',
        sessionId: 'sess-test',
        type: 'tool.call.completed',
        payload: {
          toolCallId: 'call-1',
          result: 'Success',
        },
      },
      {
        timestamp: '2026-10-02T00:00:03.000Z',
        runId: 'run-test',
        sessionId: 'sess-test',
        type: 'verification.completed',
        payload: { verdict: 'verified', script: 'test' },
      },
      {
        timestamp: '2026-10-02T00:00:04.000Z',
        runId: 'run-test',
        sessionId: 'sess-test',
        type: 'agent.loop.completed',
        payload: { summary: { success: true, turns: 2 } },
      },
    ];

    const markdown = RunTracer.exportMarkdown(entries);
    expect(markdown).toContain('# Execution Trace: run-test');
    expect(markdown).toContain('## Tool Executions');
    expect(markdown).toContain('edit_file');
    expect(markdown).toContain('## Verification');
    expect(markdown).toContain('verification.completed');
    expect(markdown).toContain('## Final Summary');
  });
});
