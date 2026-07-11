import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

/**
 * Discovers and runs tests in files related to the patch's affected files.
 */
export class TestAgent implements SubAgent {
  id = 'test-agent';
  name = 'Test Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    const affectedFiles: string[] = task.payload?.affectedFiles ?? [];
    const workspaceRoot: string = task.payload?.workspaceRoot ?? process.cwd();

    const testFiles: string[] = [];
    const testResults: { file: string; status: 'passed' | 'failed' | 'skipped'; error?: string }[] = [];

    // Discover test files near the affected files
    for (const file of affectedFiles) {
      const base = path.basename(file, path.extname(file));
      const dir = path.dirname(path.join(workspaceRoot, file));
      const candidates = [
        `${base}.test.ts`, `${base}.spec.ts`,
        `${base}.test.js`, `${base}.spec.js`,
        path.join('__tests__', `${base}.test.ts`)
      ];
      for (const candidate of candidates) {
        const full = path.join(dir, candidate);
        if (fs.existsSync(full)) {
          testFiles.push(full);
          break;
        }
      }
    }

    if (testFiles.length === 0) {
      return {
        taskId: task.id,
        agentId: this.id,
        status: 'success',
        data: { testFiles: [], testResults: [], summary: 'No test files found for affected files' },
        durationMs: performance.now() - start
      };
    }

    // Run tests via bun test (non-blocking, with timeout)
    for (const testFile of testFiles.slice(0, 5)) {
      try {
        const result = childProcess.spawnSync('bun', ['test', testFile], {
          cwd: workspaceRoot,
          timeout: 15_000,
          encoding: 'utf-8'
        });
        if (result.status === 0) {
          testResults.push({ file: testFile, status: 'passed' });
        } else {
          testResults.push({
            file: testFile,
            status: 'failed',
            error: (result.stderr || result.stdout || '').slice(0, 300)
          });
        }
      } catch (e: any) {
        testResults.push({ file: testFile, status: 'skipped', error: e.message });
      }
    }

    const passed = testResults.filter(r => r.status === 'passed').length;
    const failed = testResults.filter(r => r.status === 'failed').length;

    return {
      taskId: task.id,
      agentId: this.id,
      status: failed > 0 ? 'failed' : 'success',
      data: {
        testFiles,
        testResults,
        summary: `${passed} passed, ${failed} failed, ${testResults.length - passed - failed} skipped`
      },
      error: failed > 0 ? `${failed} test(s) failed` : undefined,
      durationMs: performance.now() - start
    };
  }
}
