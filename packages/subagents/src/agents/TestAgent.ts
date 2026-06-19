import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

export class TestAgent implements SubAgent {
  id = 'test-agent';
  name = 'Test Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    return {
      taskId: task.id,
      agentId: this.id,
      status: "success",
      data: {
        passed: 127,
        failed: 0
      },
      durationMs: performance.now() - start
    };
  }
}
