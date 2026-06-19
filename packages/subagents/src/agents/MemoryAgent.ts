import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

export class MemoryAgent implements SubAgent {
  id = 'memory-agent';
  name = 'Memory Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    return {
      taskId: task.id,
      agentId: this.id,
      status: "success",
      data: {
        memories: ["Previous fix applied similar patch to auth/session.ts"]
      },
      durationMs: performance.now() - start
    };
  }
}
