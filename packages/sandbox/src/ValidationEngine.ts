import { Sandbox } from './models';
import { SandboxValidationError } from './SandboxErrors';

export interface ValidationResult {
  passed: boolean;
  output: string;
}

export interface ValidationReport {
  lint: ValidationResult;
  typecheck: ValidationResult;
  tests: ValidationResult;
  success: boolean;
}

export class ValidationEngine {
  constructor(private sandbox: Sandbox) {}

  public async runLint(): Promise<ValidationResult> {
    return this.runCommand('bun run lint');
  }

  public async runTypecheck(): Promise<ValidationResult> {
    return this.runCommand('bun run typecheck');
  }

  public async runTests(): Promise<ValidationResult> {
    return this.runCommand('bun test');
  }

  public async validateAll(): Promise<ValidationReport> {
    const lint = await this.runLint();
    const typecheck = await this.runTypecheck();
    const tests = await this.runTests();

    const success = lint.passed && typecheck.passed && tests.passed;

    return {
      lint,
      typecheck,
      tests,
      success
    };
  }

  private async runCommand(command: string): Promise<ValidationResult> {
    try {
      const result = await this.sandbox.execute(command);
      return {
        passed: result.exitCode === 0,
        output: result.exitCode === 0 ? result.stdout : `${result.stdout}\n${result.stderr}`.trim()
      };
    } catch (error: any) {
      return {
        passed: false,
        output: error.message || 'Unknown execution error'
      };
    }
  }
}
