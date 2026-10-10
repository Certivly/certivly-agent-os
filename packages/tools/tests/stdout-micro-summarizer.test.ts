import { describe, it, expect } from 'bun:test';
import { StdoutMicroSummarizer } from '../src/storage/StdoutMicroSummarizer';

describe('StdoutMicroSummarizer (Claude Code token-thrifty execution summary)', () => {
  it('1. returns short output without summarization', () => {
    const raw = 'All 5 tests passed.\nDone in 0.12s.';
    const res = StdoutMicroSummarizer.summarize(raw, { exitCode: 0 });
    expect(res.isSummarized).toBe(false);
    expect(res.summary).toBe(raw);
    expect(res.totalLines).toBe(2);
  });

  it('2. summarizes verbose outputs and isolates error diagnostics', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 50; i++) {
      if (i === 12) {
        lines.push('TypeError: Cannot read property "name" of undefined at auth.ts:42');
      } else if (i === 30) {
        lines.push('FAIL tests/auth.test.ts: authentication failed');
      } else {
        lines.push(`info: processing step ${i}... completed successfully`);
      }
    }
    const verboseOutput = lines.join('\n');

    const res = StdoutMicroSummarizer.summarize(verboseOutput, {
      command: 'bun test',
      exitCode: 1,
      thresholdLines: 20,
    });

    expect(res.isSummarized).toBe(true);
    expect(res.totalLines).toBe(50);
    expect(res.errorLines.length).toBeGreaterThanOrEqual(2);
    expect(res.errorLines.some(e => e.includes('TypeError'))).toBe(true);
    expect(res.errorLines.some(e => e.includes('FAIL'))).toBe(true);
    expect(res.summary).toContain('[Micro-Summary: "bun test" | Status: EXIT CODE 1');
    expect(res.summary).toContain('Primary Diagnostics');
    expect(res.summary).toContain('Head Preview:');
    expect(res.summary).toContain('Tail Preview:');
  });

  it('3. handles empty or whitespace outputs gracefully', () => {
    const res = StdoutMicroSummarizer.summarize('');
    expect(res.isSummarized).toBe(false);
    expect(res.summary).toContain('Command completed with no output');
  });
});
