import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

/**
 * Retrieves relevant memories from the MemoryStore based on the task query.
 */
export class MemoryAgent implements SubAgent {
  id = 'memory-agent';
  name = 'Memory Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    const query: string = task.payload?.q ?? task.payload?.query ?? '';

    let memories: any[] = [];

    try {
      const memoryStore = context.workspace.memory;
      if (memoryStore) {
        if (typeof memoryStore.search === 'function') {
          memories = memoryStore.search(query, 10);
        } else if (typeof memoryStore.getMemoriesByType === 'function') {
          const all = [
            ...memoryStore.getMemoriesByType('FactMemory'),
            ...memoryStore.getMemoriesByType('DecisionMemory'),
            ...memoryStore.getMemoriesByType('PatternMemory'),
          ];
          const lower = query.toLowerCase();
          memories = all.filter(m => {
            const text = ((m.topic || '') + ' ' + (m.content || '')).toLowerCase();
            return lower.split(' ').some(w => w.length > 3 && text.includes(w));
          }).slice(0, 10);
        }
      }

      // Also check brain's assembled context for memory items
      if (context.workspace.brain && memories.length === 0) {
        try {
          const response = await context.workspace.brain.answer(query);
          memories = (response.context?.knowledge ?? [])
            .filter((k: any) => k.type === 'memory')
            .map((k: any) => k.content);
        } catch {}
      }
    } catch (e: any) {
      // Non-fatal
    }

    return {
      taskId: task.id,
      agentId: this.id,
      status: 'success',
      data: { memories, count: memories.length },
      durationMs: performance.now() - start
    };
  }
}
