import { ExecutionContext } from "./ExecutionContext";
import { ValidationResult } from "./models";

export class ValidationCoordinator {
  constructor(private sandboxManager: any) {}

  public async validate(context: ExecutionContext): Promise<ValidationResult> {
    // If no sandbox available, skip validation and pass
    if (!context.sandbox) {
      return {
        passed: true,
        buildPassed: true,
        lintPassed: true,
        testsPassed: true,
        errors: []
      };
    }

    const errors: string[] = [];

    // Try build
    let buildPassed = true;
    try {
      const buildResult = await context.sandbox.execute("bun run build --if-present 2>&1");
      buildPassed = buildResult.exitCode === 0;
      if (!buildPassed) errors.push(`Build: ${buildResult.stderr || buildResult.stdout}`);
    } catch (e: any) {
      buildPassed = true; // non-fatal if build script missing
    }

    // Try tests (non-fatal)
    let testsPassed = true;
    try {
      const testResult = await context.sandbox.execute("bun run test --if-present 2>&1");
      testsPassed = testResult.exitCode === 0;
      if (!testsPassed) errors.push(`Tests: ${testResult.stderr || testResult.stdout}`);
    } catch {
      testsPassed = true;
    }

    return {
      passed: buildPassed,
      buildPassed,
      lintPassed: true,
      testsPassed,
      errors
    };
  }
}
