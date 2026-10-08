import type { VerificationResult, VerificationExecutor } from '../verification/Verification';

import type { RunStatus } from '@agent-os/sessions';

export type PipelineStage =
  | 'explore'   // read files, call repo_map, grep
  | 'edit'      // write/edit files in sandbox
  | 'verify'    // run verification commands
  | 'patch'     // produce a ChangeSet from sandbox diff
  | 'approve';  // present approval package, await user decision

export interface LightweightPlan {
  objective: string;
  filesLikelyTouched: string[];
  steps: string[];
  verificationCommands: string[];
  risks: string[];
  pipeline: PipelineStage[];
  isEditTask: boolean;
}

export interface WorkflowMemoryStore {
  getMemories(): any[];
  formatPromptHints(): string;
  save(record: any): boolean;
  close?(): void;
}

export interface LoopState {
  filesRead: Set<string>;
  filesEdited: Set<string>;
  pipelineCompleted: PipelineStage[];
  verificationAttempts: number;
  lastVerificationOutput?: string;
  loadedInstructionDirs?: Set<string>;
  searchSubagentResult?: { rankedFiles: string[]; reason: string; turnsUsed: number };
}

export type PermissionMode = 'plan' | 'manual' | 'acceptEdits' | 'auto';

export interface AgentLoopOptions {
  maxTurns: number;
  maxWallTimeMs: number;
  maxApproxTokens: number;
  maxVerificationFixAttempts?: number;
  verificationExecutor?: VerificationExecutor;
  skipVerification?: boolean;
  workflowMemoryStore?: WorkflowMemoryStore;
  selfReview?: boolean;
  maxSelfReviewAttempts?: number;
  parallelExploration?: boolean;
  explorationTimeoutMs?: number;
  planningMode?: 'off' | 'auto' | 'always';
  noReadGuard?: boolean;
  permissionMode?: PermissionMode;
  hooks?: import('@agent-os/config').HooksConfig;
}

export interface AgentLoopInput {
  sessionId: string;
  runId?: string;
  userInput: string;
  workspaceRoot: string;
  sandboxRoot?: string;
  abortSignal?: AbortSignal;
  tracePath?: string;
}

export interface ResumeLoopInput {
  sessionId: string;
  runId?: string;
  workspaceRoot?: string;
  sandboxRoot?: string;
  abortSignal?: AbortSignal;
}


export interface RunCommandRecord {
  command: string;
  cwd: string;
  exitCode: number | null;
  durationMs: number;
  stdoutTail?: string;
  stderrTail?: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  success: boolean;
  error?: string;
}

export interface RunSummary {
  sessionId: string;
  runId?: string;
  status?: RunStatus;
  success: boolean;
  finalText: string;
  turns: number;
  approxInputTokens: number;
  approxOutputTokens: number;
  toolCalls: ToolCallRecord[];
  commands: RunCommandRecord[];
  filesChanged: string[];
  errors: string[];
  searchSubagentResult?: { rankedFiles: string[]; reason: string; turnsUsed: number };
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  verification?: VerificationResult;
  verificationAttempts?: number;
  providerName?: string;
  modelName?: string;
  estimatedCostUsd?: number | null;
  callLatencies?: number[];
  plan?: LightweightPlan;
  planRevisions?: LightweightPlan[];
  warnings?: string[];
  changeSetId?: string;
  hasChanges?: boolean;
  verificationPassed?: boolean;
  verificationOutput?: string;
  repairAttempts: number;
}

export interface LoopToolCall {
  id: string;
  name: string;
  args: string;
}

export interface LoopMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: LoopToolCall[];
  isError?: boolean;
}
