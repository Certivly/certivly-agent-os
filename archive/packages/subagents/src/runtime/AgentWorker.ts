import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from '../agents/SubAgent';

export class AgentWorker {
  constructor(public id: string) {}

  public async execute(agent: SubAgent, task: AgentTask, context: AgentContext): Promise<AgentResult> {
    try {
      const result = await agent.execute(task, context);
      return result;
    } catch (e: any) {
      return {
        taskId: task.id,
        agentId: agent.id,
        status: "failed",
        data: null,
        error: e.message,
        durationMs: 0
      };
    }
  }
}
