import { KnowledgeUnit } from "@agent-os/wicer";
import { TrustReport } from "@agent-os/trust-runtime";
import { PatchBundle } from "@agent-os/patch-engine";

export interface ValidationResult {
  passed: boolean;
  buildPassed: boolean;
  lintPassed: boolean;
  testsPassed: boolean;
  errors: string[];
}

export interface ApprovalPackage {
  executionId: string;
  patchBundle: PatchBundle;
  validationResult: ValidationResult;
  trustReport: TrustReport;
  impactReport: KnowledgeUnit;
  summary: string;
}

export type FailureCategory =
  | "SKILL_FAILURE"
  | "VALIDATION_FAILURE"
  | "SANDBOX_FAILURE"
  | "PATCH_FAILURE"
  | "UNKNOWN";

export interface TaskFailure {
  taskId: string;
  error: string;
  category: FailureCategory;
}

export interface RunnableTask {
  id: string;
  type: string;
  title: string;
  assignedSkill?: string;
}
