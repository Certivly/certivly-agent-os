import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EvalLoader } from '../src/eval/EvalLoader';
import { EvalRunner } from '../src/eval/EvalRunner';
import { RunTracer } from '@agent-os/agent-runtime';

describe('Action 3.04: Trace Commands & Evaluation Integration', () => {
  it('1. eval result references trace path and trace file exists on disk', async () => {
    const tasksRoot = EvalLoader.getDefaultTasksRoot();
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);

    const result = await EvalRunner.runTask(task, {
      modelName: 'fake:scripted',
    });

    expect(result.tracePath).toBeDefined();
    expect(typeof result.tracePath).toBe('string');
    expect(fs.existsSync(result.tracePath!)).toBe(true);

    const entries = RunTracer.readTrace(result.tracePath!);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].type).toBe('agent.loop.started');
  });

  it('2. findTraceFile finds the trace file across sessions', async () => {
    const tempDir = path.join(process.cwd(), 'temp-find-trace-' + Date.now());
    try {
      const tracer = new RunTracer({
        sessionId: 'session-search',
        runId: 'run-unique-12345',
        tracesDir: tempDir,
      });
      tracer.recordEvent('test.event', { ok: true });

      const found = RunTracer.findTraceFile('run-unique-12345', tempDir);
      expect(found).not.toBeNull();
      expect(found).toBe(tracer.traceFilePath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('3. trace export format json and md work correctly', () => {
    const sampleEntries = [
      {
        timestamp: '2026-10-02T01:00:00.000Z',
        runId: 'run-exp',
        sessionId: 'sess-exp',
        type: 'agent.loop.started',
        payload: { userInput: 'Hello world' },
      },
      {
        timestamp: '2026-10-02T01:00:01.000Z',
        runId: 'run-exp',
        sessionId: 'sess-exp',
        type: 'agent.loop.completed',
        payload: { summary: { success: true } },
      },
    ];

    const md = RunTracer.exportMarkdown(sampleEntries);
    expect(md).toContain('# Execution Trace: run-exp');
    expect(md).toContain('Hello world');

    const json = JSON.stringify(sampleEntries, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(2);
    expect(parsed[0].runId).toBe('run-exp');
  });
});
