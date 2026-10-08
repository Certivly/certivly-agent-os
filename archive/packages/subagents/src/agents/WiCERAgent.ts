import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

/**
 * Queries WiCER for knowledge units relevant to the task.
 */
export class WiCERAgent implements SubAgent {
  id = 'wicer-agent';
  name = 'WiCER Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    const query: string = task.payload?.q ?? task.payload?.query ?? '';

    let knowledgeUnits: any[] = [];

    try {
      const wicer = context.workspace.wicer;
      if (wicer && typeof wicer.query === 'function') {
        const types = ['file', 'symbol', 'pattern', 'convention'];
        const lower = query.toLowerCase();
        for (const type of types) {
          const units = (wicer.query(type) as any[]).filter(u => {
            const text = ((u.name || '') + ' ' + (u.description || '')).toLowerCase();
            return lower.split(' ').some(w => w.length > 3 && text.includes(w));
          });
          knowledgeUnits.push(...units.slice(0, 5));
        }
        knowledgeUnits = knowledgeUnits.slice(0, 20);
      }
    } catch (e: any) {
      // Non-fatal
    }

    return {
      taskId: task.id,
      agentId: this.id,
      status: 'success',
      data: { knowledgeUnits, count: knowledgeUnits.length },
      durationMs: performance.now() - start
    };
  }
}
