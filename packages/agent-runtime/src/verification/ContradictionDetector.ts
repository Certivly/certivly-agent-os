export interface ExecutionEvidence {
  filesModified: string[];
  filesInspected: string[];
  commandResults?: Array<{
    command: string;
    exitCode: number;
    stdout?: string;
    stderr?: string;
  }>;
  testResults?: {
    passed: number;
    failed: number;
    errors?: string[];
  };
  buildPassed?: boolean;
}

export interface Contradiction {
  id: string;
  claim: string;
  severity: 'critical' | 'warning';
  evidenceSummary: string;
  explanation: string;
}

export class ContradictionDetector {
  /**
   * Evaluates text claims made by an agent against hard execution evidence
   * learned from archive trust-runtime and Claude Code truthful verification.
   */
  public evaluateClaims(agentText: string, evidence: ExecutionEvidence): Contradiction[] {
    const contradictions: Contradiction[] = [];
    const lowerText = agentText.toLowerCase();

    // 1. Tests Passing Claim Verification
    const claimsTestsPassing =
      lowerText.includes('tests pass') ||
      lowerText.includes('tests are passing') ||
      lowerText.includes('all tests pass') ||
      lowerText.includes('test suite passed') ||
      lowerText.includes('test passed');

    if (claimsTestsPassing) {
      if (evidence.testResults && evidence.testResults.failed > 0) {
        contradictions.push({
          id: `contra-tests-${Date.now()}`,
          claim: 'Agent stated tests are passing',
          severity: 'critical',
          evidenceSummary: `${evidence.testResults.failed} failing tests recorded`,
          explanation: `Agent claimed tests are passing, but test runner evidence shows ${evidence.testResults.failed} failures: ${evidence.testResults.errors?.join(', ') || 'test assertion errors'}.`,
        });
      } else if (evidence.commandResults?.some(c => (c.command.includes('test') || c.command.includes('jest') || c.command.includes('pytest')) && c.exitCode !== 0)) {
        const failedCmd = evidence.commandResults.find(c => c.exitCode !== 0)!;
        contradictions.push({
          id: `contra-test-cmd-${Date.now()}`,
          claim: 'Agent stated tests are passing',
          severity: 'critical',
          evidenceSummary: `Command "${failedCmd.command}" exited with code ${failedCmd.exitCode}`,
          explanation: `Agent claimed tests passed, but test command exited with failure code ${failedCmd.exitCode}.`,
        });
      }
    }

    // 2. Build / Clean Compilation Claim Verification
    const claimsBuildClean =
      lowerText.includes('build succeeds') ||
      lowerText.includes('built cleanly') ||
      lowerText.includes('no compile errors') ||
      lowerText.includes('no syntax errors') ||
      lowerText.includes('compilation successful');

    if (claimsBuildClean) {
      if (evidence.buildPassed === false) {
        contradictions.push({
          id: `contra-build-${Date.now()}`,
          claim: 'Agent stated build succeeded',
          severity: 'critical',
          evidenceSummary: 'Build status marked as failed',
          explanation: 'Agent claimed clean build/compilation, but build verifier recorded failure.',
        });
      }
    }

    // 3. File Modification Claims Verification
    const fileModMatches = Array.from(
      agentText.matchAll(/(?:modified|updated|edited|patched|wrote to|created)\s+(?:the\s+file\s+)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/gi)
    );

    for (const match of fileModMatches) {
      const claimedFile = match[1].replace(/^[./\\]+/, '').trim();
      const actuallyModified = evidence.filesModified.some(f => {
        const norm = f.replace(/^[./\\]+/, '').trim();
        return norm === claimedFile || norm.endsWith(claimedFile) || claimedFile.endsWith(norm);
      });

      if (!actuallyModified) {
        contradictions.push({
          id: `contra-file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          claim: `Agent claimed modifying file "${match[1]}"`,
          severity: 'warning',
          evidenceSummary: `Actual files modified: [${evidence.filesModified.join(', ') || 'none'}]`,
          explanation: `Agent claimed to have modified "${match[1]}", but tool execution logs confirm no edits were applied to this path.`,
        });
      }
    }

    return contradictions;
  }
}
