import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

/**
 * Audits code conventions for the affected files using WiCER convention units.
 */
export class ConventionAgent implements SubAgent {
  id = 'convention-agent';
  name = 'Convention Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    const affectedFiles: string[] = task.payload?.affectedFiles ?? [];
    const patchPlan: string[] = task.payload?.patchPlan ?? [];

    const conventions: string[] = [];
    const violations: string[] = [];

    try {
      const wicer = context.workspace.wicer;
      if (wicer && typeof wicer.query === 'function') {
        const units = wicer.query('convention') as any[];
        for (const unit of units.slice(0, 15)) {
          conventions.push(unit.description || unit.name || unit.id);
        }
      }

      // Heuristic checks on affected TypeScript files
      for (const file of affectedFiles) {
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          if (file.includes('test') || file.includes('spec')) continue;
          // Check if there's a matching test file — no test = violation
          const hasTest = patchPlan.some(p => p.includes('test') || p.includes('spec'));
          if (!hasTest && affectedFiles.length > 0) {
            violations.push(`${file}: No corresponding test file in patch plan`);
          }
        }
      }
    } catch (e: any) {
      // Non-fatal
    }

    return {
      taskId: task.id,
      agentId: this.id,
      status: 'success',
      data: { conventions, violations, compliant: violations.length === 0 },
      durationMs: performance.now() - start
    };
  }
}
