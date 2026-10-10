export type FailureCategory =
  | 'syntax_error'
  | 'type_error'
  | 'test_assertion'
  | 'file_not_found'
  | 'permission_denied'
  | 'timeout'
  | 'policy_blocked'
  | 'unknown';

export interface FailureDiagnosis {
  category: FailureCategory;
  confidence: number;
  rootCause: string;
  suggestedAction: 'revert_and_replan' | 'add_null_guard' | 'check_imports' | 'fix_syntax' | 'request_approval' | 'retry';
  targetedGuidance: string;
  relevantSymbols?: string[];
}

export class FailureAnalyzer {
  /**
   * Diagnoses execution failures and returns structured self-repair guidance
   * learned from archive agent-runtime-adaptive and OpenCode Conductor.
   */
  public analyze(error: string | Error, context?: { command?: string; toolName?: string }): FailureDiagnosis {
    const errorText = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error);
    const lower = errorText.toLowerCase();

    // 1. Syntax / Parsing Errors
    if (lower.includes('syntaxerror') || lower.includes('unexpected token') || lower.includes('parsing error')) {
      const match = errorText.match(/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+)/);
      return {
        category: 'syntax_error',
        confidence: 0.95,
        rootCause: 'Malformed code syntax or unbalanced token/brackets.',
        suggestedAction: 'fix_syntax',
        targetedGuidance: `Review recent edits for unbalanced brackets, missing commas, or truncated strings.${match ? ` Focus on ${match[1]} line ${match[2]}.` : ''}`,
      };
    }

    // 2. Type / Null Handling Errors
    if (
      lower.includes('typeerror') ||
      lower.includes('cannot read property') ||
      lower.includes('cannot read properties') ||
      lower.includes('is not a function') ||
      lower.includes('ts2339') ||
      lower.includes('ts2322')
    ) {
      return {
        category: 'type_error',
        confidence: 0.9,
        rootCause: 'Dereferencing null/undefined or invoking an unsupported method.',
        suggestedAction: 'add_null_guard',
        targetedGuidance: 'Add optional chaining (?.) or an explicit existence check before property access, and verify the type contract of the return value.',
      };
    }

    // 3. Test Assertion Failures
    if (
      lower.includes('expect(') ||
      lower.includes('assertionerror') ||
      lower.includes('expected') && lower.includes('received') ||
      lower.includes('test failed') ||
      lower.includes('failed:')
    ) {
      return {
        category: 'test_assertion',
        confidence: 0.95,
        rootCause: 'Test assertion expectation mismatched implementation return value.',
        suggestedAction: 'revert_and_replan',
        targetedGuidance: 'Analyze the exact diff between expected and received values. Recheck off-by-one errors, edge cases (empty inputs, zero, negative), and boundary conditions.',
      };
    }

    // 4. File Not Found / Missing Module
    if (lower.includes('enoent') || lower.includes('cannot find module') || lower.includes('no such file')) {
      const modMatch = errorText.match(/cannot find module ['"]([^'"]+)['"]/i);
      return {
        category: 'file_not_found',
        confidence: 0.9,
        rootCause: 'Target file or package dependency cannot be resolved on disk.',
        suggestedAction: 'check_imports',
        targetedGuidance: `Verify relative path and import specifier.${modMatch ? ` Missing module: ${modMatch[1]}.` : ''} Check if the file exists using list_dir or read_file.`,
        relevantSymbols: modMatch ? [modMatch[1]] : undefined,
      };
    }

    // 5. Policy Blocked
    if (lower.includes('blocked by policy') || lower.includes('permission denied') || lower.includes('blocked by subagent policy')) {
      return {
        category: 'policy_blocked',
        confidence: 1.0,
        rootCause: 'Command or tool execution prohibited by active security policy.',
        suggestedAction: 'request_approval',
        targetedGuidance: 'Action is restricted by security policy. Request explicit user approval or switch to a read-only alternative.',
      };
    }

    // 6. Timeouts
    if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('etimedout')) {
      return {
        category: 'timeout',
        confidence: 0.85,
        rootCause: 'Process exceeded execution time budget.',
        suggestedAction: 'retry',
        targetedGuidance: 'Command or network request exceeded time limit. Increase timeoutMs or break task into smaller chunks.',
      };
    }

    // Default Fallback
    return {
      category: 'unknown',
      confidence: 0.5,
      rootCause: errorText.slice(0, 100),
      suggestedAction: 'retry',
      targetedGuidance: 'Inspect error output carefully and check the nearest stack trace line number.',
    };
  }
}
