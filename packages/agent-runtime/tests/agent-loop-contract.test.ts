import { describe, it, expect } from 'bun:test';
import type { RunSummary, ToolCallRecord, RunCommandRecord } from '../src/loop/types';

describe('Agent Loop Contract', () => {
  it('should allow constructing a valid RunSummary', () => {
    const summary: RunSummary = {
      sessionId: 'sess-123',
      success: true,
      finalText: 'Finished all tasks.',
      turns: 2,
      approxInputTokens: 150,
      approxOutputTokens: 80,
      toolCalls: [
        {
          id: 'call-1',
          name: 'read_file',
          args: { path: 'src/index.ts' },
          success: true,
        },
      ],
      commands: [
        {
          command: 'bun test',
          cwd: '/workspace',
          exitCode: 0,
          durationMs: 42,
          stdoutTail: '1 pass',
        },
      ],
      filesChanged: ['src/index.ts'],
      errors: [],
      repairAttempts: 0,
    };

    expect(summary.success).toBe(true);
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.commands).toHaveLength(1);
    expect(summary.errors).toHaveLength(0);
  });

  it('should support success:false carrying errors', () => {
    const summary: RunSummary = {
      sessionId: 'sess-err',
      success: false,
      finalText: 'Failed to complete task.',
      turns: 1,
      approxInputTokens: 50,
      approxOutputTokens: 20,
      toolCalls: [],
      commands: [],
      filesChanged: [],
      errors: ['File not found: nonexistent.ts'],
      repairAttempts: 0,
    };

    expect(summary.success).toBe(false);
    expect(summary.errors).toContain('File not found: nonexistent.ts');
  });

  it('should represent tool failures in ToolCallRecord', () => {
    const record: ToolCallRecord = {
      id: 'call-err',
      name: 'run_command',
      args: { cmd: 'exit 1' },
      success: false,
      error: 'Command exited with status 1',
    };

    expect(record.success).toBe(false);
    expect(record.error).toBe('Command exited with status 1');
  });
});
