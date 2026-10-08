import { FailureCategory } from "./models";

export class FailureAnalyzer {
  public analyzeFailure(error: any, taskType: string): FailureCategory {
    const errorMsg = error?.message || String(error);

    if (taskType === "SKILL") {
      return "SKILL_FAILURE";
    }

    if (errorMsg.includes("sandbox") || errorMsg.includes("isolated runtime")) {
      return "SANDBOX_FAILURE";
    }

    if (taskType === "VALIDATE" || taskType === "TEST" || errorMsg.includes("validation")) {
      return "VALIDATION_FAILURE";
    }

    if (taskType === "PATCH" || errorMsg.includes("patch")) {
      return "PATCH_FAILURE";
    }

    return "UNKNOWN";
  }
}
