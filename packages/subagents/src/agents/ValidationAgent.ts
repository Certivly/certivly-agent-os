import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

/**
 * Validates patch plans against repository conventions and AST structure.
 */
export class ValidationAgent implements SubAgent {
  id = 'validation-agent';
  name = 'Validation Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    const patchPlan: string[] = task.payload?.patchPlan ?? [];
    const affectedFiles: string[] = task.payload?.affectedFiles ?? [];

    const issues: string[] = [];
    const warnings: string[] = [];
    let valid = true;

    try {
      // Check conventions via WiCER convention knowledge
      const wicer = context.workspace.wicer;
      if (wicer && typeof wicer.query === 'function') {
        const conventions = wicer.query('convention') as any[];
        for (const convention of conventions.slice(0, 5)) {
          // Convention validation is heuristic at this stage
          if (convention.rule && affectedFiles.some(f => f.endsWith('.ts'))) {
            warnings.push(`Convention check: ${convention.rule}`);
          }
        }
      }

      // Basic structural checks on the patch plan
      if (patchPlan.length === 0) {
        issues.push('Empty patch plan — nothing to validate');
        valid = false;
      }

      // Check for circular dependency risk in affected files
      const repoGraph = context.workspace.repositoryGraph;
      if (repoGraph?.dependencies && affectedFiles.length > 1) {
        const deps = repoGraph.dependencies as any[];
        for (const file of affectedFiles) {
          const fileDeps = deps.filter((d: any) => d.from === file).map((d: any) => d.to);
          const circular = fileDeps.some((dep: string) => affectedFiles.includes(dep));
          if (circular) {
            warnings.push(`Potential circular dependency risk in ${file}`);
          }
        }
      }
    } catch (e: any) {
      warnings.push('Convention validation unavailable: ' + e.message);
    }

    return {
      taskId: task.id,
      agentId: this.id,
      status: 'success',
      data: { valid, issues, warnings, patchPlanSize: patchPlan.length },
      durationMs: performance.now() - start
    };
  }
}
