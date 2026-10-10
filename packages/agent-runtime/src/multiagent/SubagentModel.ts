export type SubagentRole =
  | 'explorer'
  | 'librarian'
  | 'researcher'
  | 'coder'
  | 'verifier'
  | 'reviewer'
  | 'custom';

export type SubagentModelRole = 'fast' | 'planning' | 'review' | 'default';

export interface SubagentDefinition {
  name: string;
  description: string;
  role: SubagentRole;
  systemPrompt: string;
  modelRole?: SubagentModelRole;
  tools: string[]; // Whitelist of allowed tool names
  maxTurns?: number; // Bounds turns (default 10)
  source?: 'builtin' | 'workspace' | 'user';
  filePath?: string;
}

export interface SubagentExecutionOptions {
  sessionId?: string;
  workspaceRoot?: string;
  sandboxRoot?: string;
  abortSignal?: AbortSignal;
  maxTurns?: number;
  initialContext?: Record<string, unknown>;
}

export interface SubagentExecutionResult {
  agentName: string;
  task: string;
  success: boolean;
  finalText: string;
  turnsUsed: number;
  toolsExecuted: string[];
  filesInspected: string[];
  filesModified: string[];
  errors: string[];
  durationMs: number;
}

export type TeamWorkflowType =
  | 'deep-research'
  | 'research-and-implement'
  | 'investigate-and-fix'
  | 'review-and-audit'
  | 'custom';

export interface TeamWorkflowStep {
  name: string;
  agentName: string;
  promptTemplate: string;
  runInParallelWith?: string[];
  passOutputToNext?: boolean;
}

export interface TeamWorkflowResult {
  workflow: TeamWorkflowType;
  goal: string;
  success: boolean;
  stepResults: SubagentExecutionResult[];
  finalSummary: string;
  totalDurationMs: number;
}
