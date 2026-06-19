import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

export class ConventionAgent implements SubAgent {
  id = 'convention-agent';
  name = 'Convention Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    return {
      taskId: task.id,
      agentId: this.id,
      status: "success",
      data: {
        compliant: true
      },
      durationMs: performance.now() - start
    };
  }
}
