import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

/**
 * Searches the repository using WiCER knowledge units and the repository graph.
 */
export class SearchAgent implements SubAgent {
  id = 'search-agent';
  name = 'Search Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    const query: string = task.payload?.q ?? task.payload?.query ?? '';

    const files: string[] = [];
    const matches: any[] = [];

    try {
      // Search via WiCER knowledge units
      const wicer = context.workspace.wicer;
      if (wicer && typeof wicer.query === 'function') {
        const units = wicer.query('file') as any[];
        const lower = query.toLowerCase();
        for (const unit of units) {
          const text = ((unit.name || '') + ' ' + (unit.description || '')).toLowerCase();
          if (text.includes(lower)) {
            files.push(unit.name || unit.id);
            matches.push({ id: unit.id, name: unit.name, relevance: 1.0 });
            if (files.length >= 20) break;
          }
        }
      }

      // Also search the repository graph files map
      const graph = context.workspace.repositoryGraph;
      if (graph?.files && files.length < 10) {
        const lower = query.toLowerCase();
        for (const [path] of graph.files) {
          if (path.toLowerCase().includes(lower) && !files.includes(path)) {
            files.push(path);
            if (files.length >= 20) break;
          }
        }
      }
    } catch (e: any) {
      // Non-fatal — return empty results
    }

    return {
      taskId: task.id,
      agentId: this.id,
      status: 'success',
      data: { files, matches, query },
      durationMs: performance.now() - start
    };
  }
}
