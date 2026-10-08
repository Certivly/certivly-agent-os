export type EvalDifficulty = 'easy' | 'medium' | 'hard';

export interface EvalTaskMeta {
  id: string;
  difficulty?: EvalDifficulty;
  tags?: string[];
  language?: string;
  description?: string;
  [key: string]: unknown;
}

export type VerifierType = 'ts' | 'sh' | 'js';

export interface EvalTask {
  id: string;
  taskDir: string;
  repoDir: string;
  promptPath: string;
  promptContent: string;
  verifierPath: string;
  verifierType: VerifierType;
  meta: EvalTaskMeta;
  metaPath: string;
}

export interface EvalResult {
  taskId: string;
  passed: boolean;
  skipped?: boolean;
  skipReason?: string;
  turns: number;
  toolCalls: Record<string, number>;
  tokens: { input: number; output: number };
  wallTimeMs: number;
  filesChanged: string[];
  errors: string[];
  verifierOutput?: string;
  providerName?: string;
  modelName?: string;
  estimatedCostUsd?: number | null;
  callLatencies?: number[];
  tracePath?: string;
  failureReason?: string;
}
