import { ExecutionPhase } from './ExecutionPhase';

export interface UserFacingActivity {
  id: string;
  phase: ExecutionPhase;
  message: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
}

export interface TaskSummary {
  objective: string;
  reasoning: string[];
  modifiedFiles: string[];
  testsRun: string[];
  validationResults: ValidationResultSummary[];
  patchSummary: string[];
}

export interface ValidationResultSummary {
  name: string;
  passed: boolean;
}
