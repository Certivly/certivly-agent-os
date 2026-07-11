export enum TaskType {
  ANALYZE = "ANALYZE",
  RESEARCH = "RESEARCH",
  SEARCH = "SEARCH",
  SKILL = "SKILL",
  MODIFY = "MODIFY",
  TEST = "TEST",
  VALIDATE = "VALIDATE",
  PATCH = "PATCH",
  APPROVAL = "APPROVAL"
}

export interface TaskDependency {
  fromTaskId: string;
  toTaskId: string;
}

export interface TaskNode {
  id: string;
  type: TaskType;
  title: string;
  dependencies: string[]; // List of task IDs this task depends on
  assignedSkill?: string;
  status: "pending" | "running" | "completed" | "failed";
}

export interface GoalRequest {
  requestId: string;
  sessionId: string;
  goal: string;
  workspaceRoot: string;
  constraints?: string[];
  approvalMode: "always" | "smart" | "never";
  // Intelligence context passed from earlier pipeline stages
  repositorySnapshot?: any; // RepositoryGraphSnapshot
  patternSnapshot?: any;    // PatternSnapshot
  knowledgeUnits?: any[];   // WiCER KnowledgeUnit[]
}

export interface ExecutionPlan {
  id: string;
  goalId: string; // Linking back to GoalRequest
  goal: string;
  tasks: TaskNode[];
  dependencies: TaskDependency[];
  estimatedComplexity: number;
  riskScore: number;
  requiresSandbox: boolean;
  createdAt: number;
}

export interface PlanValidation {
  valid: boolean;
  errors: string[];
}

export interface ExecutionResult {
  planId: string;
  success: boolean;
  tasksCompleted: number;
  tasksFailed: number;
  error?: string;
}

export interface ApprovalPackage {
  planId: string;
  patches: any[];
  graphDiff: any;
  impactReport: string;
  validationResults: any;
  riskScore: number;
}

export interface Planner {
  createPlan(request: GoalRequest): Promise<ExecutionPlan>;
  validatePlan(plan: ExecutionPlan): Promise<PlanValidation>;
  executePlan(plan: ExecutionPlan): Promise<ExecutionResult>;
}
