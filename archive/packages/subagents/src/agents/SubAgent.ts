import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';

export interface SubAgent {
  id: string;
  name: string;
  execute(task: AgentTask, context: AgentContext): Promise<AgentResult>;
}
