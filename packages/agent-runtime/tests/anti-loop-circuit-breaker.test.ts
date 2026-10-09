import { describe, it, expect } from 'bun:test';
import { AntiLoopMonitor } from '../src/loop/AntiLoopMonitor';

describe('AntiLoopMonitor Circuit Breaker', () => {
  it('triggers recovery nudge at threshold 3 and hard circuit breaker at threshold 6', () => {
    const monitor = new AntiLoopMonitor({ repetitionThreshold: 3, circuitBreakerLimit: 6 });

    // Turns 1 & 2: no loop
    monitor.recordAction({ turn: 1, toolName: 'edit_file', args: { path: 'a.ts', oldText: 'foo', newText: 'bar' }, output: 'error' });
    const s2 = monitor.recordAction({ turn: 2, toolName: 'edit_file', args: { path: 'a.ts', oldText: 'foo', newText: 'bar' }, output: 'error' });
    expect(s2.isLooping).toBe(false);

    // Turn 3: threshold reached -> intervention prompt, but no halt yet
    const s3 = monitor.recordAction({ turn: 3, toolName: 'edit_file', args: { path: 'a.ts', oldText: 'foo', newText: 'bar' }, output: 'error' });
    expect(s3.isLooping).toBe(true);
    expect(s3.shouldHaltLoop).toBe(false);
    expect(s3.interventionPrompt).toContain('ANTI-LOOP INTERVENTION');

    // Turn 4 & 5: continuing repetition
    monitor.recordAction({ turn: 4, toolName: 'edit_file', args: { path: 'a.ts', oldText: 'foo', newText: 'bar' }, output: 'error' });
    monitor.recordAction({ turn: 5, toolName: 'edit_file', args: { path: 'a.ts', oldText: 'foo', newText: 'bar' }, output: 'error' });

    // Turn 6: hit circuit breaker limit (6) -> shouldHaltLoop: true
    const s6 = monitor.recordAction({ turn: 6, toolName: 'edit_file', args: { path: 'a.ts', oldText: 'foo', newText: 'bar' }, output: 'error' });
    expect(s6.isLooping).toBe(true);
    expect(s6.shouldHaltLoop).toBe(true);
    expect(s6.interventionPrompt).toContain('CIRCUIT BREAKER');
  });

  it('normalizes transient comments and instructions when hashing edit actions', () => {
    const monitor = new AntiLoopMonitor({ repetitionThreshold: 2 });

    // Turn 1 with instructions: "attempt 1"
    monitor.recordAction({
      turn: 1,
      toolName: 'edit_file',
      args: { path: 'src/app.ts', oldText: 'x', newText: 'y', instructions: 'attempt 1' },
      output: 'not found',
    });

    // Turn 2 with instructions: "attempt 2 with different explanation"
    const s2 = monitor.recordAction({
      turn: 2,
      toolName: 'edit_file',
      args: { path: 'src/app.ts', oldText: 'x', newText: 'y', instructions: 'attempt 2 with different explanation' },
      output: 'not found',
    });

    // Even though instruction string changed, identical code edit is detected as a loop!
    expect(s2.isLooping).toBe(true);
  });
});
