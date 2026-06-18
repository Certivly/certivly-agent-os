import { Sandbox } from './models';

export interface ValidationResult {
  passed: boolean;
  output: string;
}

export class ValidationLayer {
  /**
   * Runs a suite of validations in the given sandbox.
   * By default, it could run `bun run check` or `bun test`.
   */
  public static async runValidations(sandbox: Sandbox, commands: string[] = ['bun run typecheck', 'bun run lint', 'bun test']): Promise<ValidationResult> {
    let combinedOutput = '';
    
    for (const cmd of commands) {
      combinedOutput += `\\n> Running: ${cmd}\\n`;
      const result = await sandbox.execute(cmd);
      combinedOutput += result.stdout;
      if (result.stderr) {
        combinedOutput += `\\n[STDERR]:\\n${result.stderr}`;
      }
      
      if (result.exitCode !== 0) {
        combinedOutput += `\\n> Failed: ${cmd} with exit code ${result.exitCode}\\n`;
        return {
          passed: false,
          output: combinedOutput
        };
      }
    }

    return {
      passed: true,
      output: combinedOutput
    };
  }
}
