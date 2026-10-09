import { describe, it, expect } from 'bun:test';
import { AntiLoopMonitor } from '../src/loop/AntiLoopMonitor';

describe('AntiLoopMonitor (Phase 1)', () => {
  it('detects tool call repetition when identical tool & args are executed 3 times', () => {
    const monitor = new AntiLoopMonitor();

    // Turn 1
    const s1 = monitor.recordAction({
      turn: 1,
      toolName: 'grep',
      args: { query: 'authenticateToken', path: 'src' },
      output: 'src/auth.ts:12:function authenticateToken()',
    });
    expect(s1.isLooping).toBe(false);

    // Turn 2: same tool and arguments
    const s2 = monitor.recordAction({
      turn: 2,
      toolName: 'grep',
      args: { path: 'src', query: 'authenticateToken' }, // different key order should canonicalize
      output: 'src/auth.ts:12:function authenticateToken()',
    });
    expect(s2.isLooping).toBe(false);

    // Turn 3: 3rd identical call triggers loop detection
    const s3 = monitor.recordAction({
      turn: 3,
      toolName: 'grep',
      args: { query: 'authenticateToken', path: 'src' },
      output: 'src/auth.ts:12:function authenticateToken()',
    });
    expect(s3.isLooping).toBe(true);
    expect(s3.loopType).toBe('tool_repetition');
    expect(s3.repetitionCount).toBe(3);
    expect(s3.interventionPrompt).toContain('ANTI-LOOP INTERVENTION');
    expect(s3.interventionPrompt).toContain('grep');
  });

  it('detects error churn when same failure output repeats 3 times', () => {
    const monitor = new AntiLoopMonitor();

    const failureOutput = 'Error: Cannot find module @agent-os/unknown';

    monitor.recordAction({
      turn: 1,
      toolName: 'run_command',
      args: { command: 'bun test test1' },
      output: failureOutput,
      isError: true,
    });

    monitor.recordAction({
      turn: 2,
      toolName: 'run_command',
      args: { command: 'bun test test2' }, // different args
      output: failureOutput, // identical failing output
      isError: true,
    });

    const s3 = monitor.recordAction({
      turn: 3,
      toolName: 'run_command',
      args: { command: 'bun test test3' },
      output: failureOutput,
      isError: true,
    });

    expect(s3.isLooping).toBe(true);
    expect(s3.loopType).toBe('error_churn');
    expect(s3.interventionPrompt).toContain('identical command/verification error output');
  });

  it('detects diff thrashing when same file is repeatedly modified across 3 actions', () => {
    const monitor = new AntiLoopMonitor();

    monitor.recordAction({
      turn: 1,
      toolName: 'edit_file',
      args: { path: 'src/config.ts', edit: 1 },
      output: 'Applied edit 1',
      filesModified: ['src/config.ts'],
    });

    monitor.recordAction({
      turn: 2,
      toolName: 'edit_file',
      args: { path: 'src/config.ts', edit: 2 },
      output: 'Reverted edit 1',
      filesModified: ['src/config.ts'],
    });

    const s3 = monitor.recordAction({
      turn: 3,
      toolName: 'edit_file',
      args: { path: 'src/config.ts', edit: 3 },
      output: 'Applied edit 3',
      filesModified: ['src/config.ts'],
    });

    expect(s3.isLooping).toBe(true);
    expect(s3.loopType).toBe('diff_thrashing');
    expect(s3.interventionPrompt).toContain('Diff thrashing detected');
  });

  it('does not trigger loop when actions and outputs progress', () => {
    const monitor = new AntiLoopMonitor();

    monitor.recordAction({
      turn: 1,
      toolName: 'list_dir',
      args: { path: '.' },
      output: 'src, package.json',
    });

    monitor.recordAction({
      turn: 2,
      toolName: 'read_file',
      args: { path: 'src/index.ts' },
      output: 'export const main = 1;',
    });

    const s3 = monitor.recordAction({
      turn: 3,
      toolName: 'run_command',
      args: { command: 'bun test' },
      output: '1 pass, 0 fail',
    });

    expect(s3.isLooping).toBe(false);
  });
});
