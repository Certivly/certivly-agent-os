import { ExecutionContext } from "./ExecutionContext";
import { ValidationResult } from "./models";

export class ValidationCoordinator {
  constructor(private sandboxManager: any) {}

  public async validate(context: ExecutionContext): Promise<ValidationResult> {
    const buildResult = await this.sandboxManager.executeInSandbox(context.sandboxId, { type: "VALIDATE", command: "npm run build --if-present" });
    const lintResult = await this.sandboxManager.executeInSandbox(context.sandboxId, { type: "VALIDATE", command: "npm run lint --if-present" });
    const testResult = await this.sandboxManager.executeInSandbox(context.sandboxId, { type: "VALIDATE", command: "npm run test --if-present" });

    const errors: string[] = [];
    if (!buildResult.success) errors.push(buildResult.error || "Build failed");
    if (!lintResult.success) errors.push(lintResult.error || "Lint failed");
    if (!testResult.success) errors.push(testResult.error || "Test failed");

    return {
      passed: buildResult.success && lintResult.success && testResult.success,
      buildPassed: buildResult.success,
      lintPassed: lintResult.success,
      testsPassed: testResult.success,
      errors
    };
  }
}
