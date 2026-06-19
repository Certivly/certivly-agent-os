import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

export class SearchAgent implements SubAgent {
  id = 'search-agent';
  name = 'Search Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    // Simulate search logic using graph and wicer (read-only)
    const files = ["auth/login.ts", "auth/session.ts"];
    
    return {
      taskId: task.id,
      agentId: this.id,
      status: "success",
      data: { files },
      durationMs: performance.now() - start
    };
  }
}
