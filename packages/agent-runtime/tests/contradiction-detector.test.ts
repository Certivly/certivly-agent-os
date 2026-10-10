import { describe, it, expect } from 'bun:test';
import { ContradictionDetector } from '../src/verification/ContradictionDetector';

describe('ContradictionDetector (Claude Code Truthful Evidence Gates)', () => {
  it('1. detects false claim of passing tests when test runner recorded failures', () => {
    const detector = new ContradictionDetector();
    const claims = 'I finished the task. All tests pass and are green.';
    const evidence = {
      filesModified: ['src/math.ts'],
      filesInspected: ['src/math.test.ts'],
      testResults: {
        passed: 4,
        failed: 1,
        errors: ['AssertionError: expected 5 to be 6'],
      },
    };

    const contradictions = detector.evaluateClaims(claims, evidence);
    expect(contradictions.length).toBe(1);
    expect(contradictions[0].severity).toBe('critical');
    expect(contradictions[0].explanation).toContain('1 failures');
  });

  it('2. detects false claim of file modification when file was never touched', () => {
    const detector = new ContradictionDetector();
    const claims = 'I updated src/auth/jwt.ts to rotate session keys.';
    const evidence = {
      filesModified: ['src/auth/user.ts'], // jwt.ts was never touched!
      filesInspected: ['src/auth/jwt.ts'],
    };

    const contradictions = detector.evaluateClaims(claims, evidence);
    expect(contradictions.length).toBe(1);
    expect(contradictions[0].severity).toBe('warning');
    expect(contradictions[0].claim).toContain('src/auth/jwt.ts');
    expect(contradictions[0].explanation).toContain('no edits were applied');
  });

  it('3. returns zero contradictions when claims align with verified evidence', () => {
    const detector = new ContradictionDetector();
    const claims = 'I updated src/math.ts. All tests pass with full coverage.';
    const evidence = {
      filesModified: ['src/math.ts'],
      filesInspected: ['src/math.ts'],
      testResults: {
        passed: 10,
        failed: 0,
      },
      buildPassed: true,
    };

    const contradictions = detector.evaluateClaims(claims, evidence);
    expect(contradictions.length).toBe(0);
  });
});
