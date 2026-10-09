import type { PermissionMode, LoopState, LightweightPlan, ToolCallRecord } from './types';
import type { LoadedInstructions } from './instructions';

export interface ContextSnapshot {
  goal: string;
  permissionMode: PermissionMode;
  instructionSummary: string;
  planSummary: string;
  recentToolResults: string;
  pendingVerificationFailure: string | null;
  pendingChangesetSummary: string | null;
}

export interface ContextAssemblerOptions {
  userInput: string;
  permissionMode?: PermissionMode;
  instructions?: LoadedInstructions;
  instructionSummary?: string;
  plan?: LightweightPlan;
  verificationPassed?: boolean;
  toolCallRecords?: ToolCallRecord[];
  filesChanged?: string[];
}

export class ContextAssembler {
  static build(loopState: LoopState, options: ContextAssemblerOptions): ContextSnapshot {
    const goal = options.userInput || '';
    const permissionMode = options.permissionMode || 'manual';
    const planSummary = options.plan
      ? `Objective: ${options.plan.objective} | Pipeline: ${options.plan.pipeline.join(' -> ')}`
      : '';
    const instructionSummary = options.instructionSummary || '';

    let pendingVerificationFailure: string | null = null;
    if (options.verificationPassed !== true && loopState.lastVerificationOutput) {
      pendingVerificationFailure = loopState.lastVerificationOutput;
    }

    let pendingChangesetSummary: string | null = null;
    const fileCount = loopState.filesEdited.size || options.filesChanged?.length || 0;
    if (fileCount > 0) {
      pendingChangesetSummary = `${fileCount} file(s) modified`;
    }

    let recentToolResults = '';
    if (options.toolCallRecords && options.toolCallRecords.length > 0) {
      const last5 = options.toolCallRecords.slice(-5);
      recentToolResults = last5
        .map((tc) => `- ${tc.name}: ${tc.success ? 'success' : 'failed' + (tc.error ? ` (${tc.error})` : '')}`)
        .join('\n');
    }

    return {
      goal,
      permissionMode,
      instructionSummary,
      planSummary,
      recentToolResults,
      pendingVerificationFailure,
      pendingChangesetSummary,
    };
  }

  static toSystemPromptSection(snapshot: ContextSnapshot): string {
    const parts: string[] = ['## Active Runtime Context'];
    parts.push(`- Goal: ${snapshot.goal}`);
    parts.push(`- Permission Mode: ${snapshot.permissionMode}`);
    if (snapshot.planSummary) {
      parts.push(`- Plan: ${snapshot.planSummary}`);
    }
    if (snapshot.pendingChangesetSummary) {
      parts.push(`- Changeset: ${snapshot.pendingChangesetSummary}`);
    }
    if (snapshot.pendingVerificationFailure) {
      parts.push(`\n### Unresolved Verification Failure\n${snapshot.pendingVerificationFailure}`);
    }
    return parts.join('\n');
  }

  /**
   * Combines static system prompt with dynamic turn context while keeping the static
   * prefix strictly first to maximize KV cache hit rates across turns.
   */
  static buildTurnSystemPrompt(staticSystemPrompt: string, snapshot: ContextSnapshot): string {
    const turnSection = ContextAssembler.toSystemPromptSection(snapshot);
    if (!turnSection || turnSection.trim() === '') {
      return staticSystemPrompt;
    }
    return `${staticSystemPrompt.trim()}\n\n${turnSection.trim()}`;
  }
}
