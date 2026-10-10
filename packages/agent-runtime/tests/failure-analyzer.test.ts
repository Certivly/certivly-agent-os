import { describe, it, expect } from 'bun:test';
import { FailureAnalyzer } from '../src/observation/FailureAnalyzer';

describe('FailureAnalyzer (Autonomous Root-Cause Self-Repair)', () => {
  const analyzer = new FailureAnalyzer();

  it('1. diagnoses syntax errors with line localization guidance', () => {
    const error = 'SyntaxError: Unexpected token "}" in src/auth/jwt.ts:42';
    const diag = analyzer.analyze(error);
    expect(diag.category).toBe('syntax_error');
    expect(diag.suggestedAction).toBe('fix_syntax');
    expect(diag.targetedGuidance).toContain('jwt.ts line 42');
  });

  it('2. diagnoses TypeError null dereferences with guard suggestions', () => {
    const error = 'TypeError: Cannot read properties of undefined (reading "permissions")';
    const diag = analyzer.analyze(error);
    expect(diag.category).toBe('type_error');
    expect(diag.suggestedAction).toBe('add_null_guard');
    expect(diag.targetedGuidance).toContain('optional chaining');
  });

  it('3. diagnoses test assertion failures', () => {
    const error = 'AssertionError: expected 401 to be 200';
    const diag = analyzer.analyze(error);
    expect(diag.category).toBe('test_assertion');
    expect(diag.suggestedAction).toBe('revert_and_replan');
  });

  it('4. diagnoses missing modules with import check guidance', () => {
    const error = "Error: Cannot find module '@agent-os/shared' from 'src/index.ts'";
    const diag = analyzer.analyze(error);
    expect(diag.category).toBe('file_not_found');
    expect(diag.suggestedAction).toBe('check_imports');
    expect(diag.relevantSymbols).toContain('@agent-os/shared');
  });

  it('5. diagnoses policy blocked actions', () => {
    const error = 'Error: Tool edit_file blocked by subagent policy';
    const diag = analyzer.analyze(error);
    expect(diag.category).toBe('policy_blocked');
    expect(diag.suggestedAction).toBe('request_approval');
  });
});
