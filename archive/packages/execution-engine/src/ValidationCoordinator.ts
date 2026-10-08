import { ExecutionContext } from "./ExecutionContext";
import { ValidationResult } from "./models";

export class ValidationCoordinator {
  constructor(private sandboxManager: any) {}

  public async validate(context: ExecutionContext): Promise<ValidationResult> {
    if (!context.sandbox) {
      return {
        passed: false,
        buildPassed: false,
        lintPassed: false,
        testsPassed: false,
        errors: ["Validation skipped: no sandbox available"],
        skipped: ["build", "lint", "test"]
      };
    }

    const errors: string[] = [];
    const skipped: string[] = [];

    const runCheck = async (name: "build" | "lint" | "test", command: string): Promise<boolean> => {
      try {
        const result = await context.sandbox!.execute(command);
        const output = `${result.stderr || ""}\n${result.stdout || ""}`;
        if (result.exitCode === 0) return true;

        if (/script\s+not\s+found|missing script|could not find script|no script/i.test(output)) {
          skipped.push(name);
          errors.push(`${name}: skipped (${output.trim() || "script missing"})`);
          return false;
        }

        errors.push(`${name}: ${output.trim() || `exit ${result.exitCode}`}`);
        return false;
      } catch (e: any) {
        skipped.push(name);
        errors.push(`${name}: skipped (${e.message || String(e)})`);
        return false;
      }
    };

    const buildPassed = await runCheck("build", "bun run build");
    const lintPassed = await runCheck("lint", "bun run lint");
    const testsPassed = await runCheck("test", "bun run test");

    return {
      passed: buildPassed && lintPassed && testsPassed,
      buildPassed,
      lintPassed,
      testsPassed,
      errors,
      skipped
    };
  }
}
