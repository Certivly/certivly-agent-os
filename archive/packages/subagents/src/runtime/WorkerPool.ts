import { AgentWorker } from './AgentWorker';
import { SubAgent } from '../agents/SubAgent';
import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from './AgentContext';

export class WorkerPool {
  private workers: AgentWorker[] = [];
  private activeCount = 0;

  constructor(public maxWorkers: number = 8) {
    for (let i = 0; i < maxWorkers; i++) {
      this.workers.push(new AgentWorker(`worker-${i}`));
    }
  }

  public async execute(agent: SubAgent, task: AgentTask, context: AgentContext): Promise<AgentResult> {
    while (this.activeCount >= this.maxWorkers) {
      await new Promise(r => setTimeout(r, 10)); // simple backoff wait
    }

    this.activeCount++;
    const worker = this.workers[this.activeCount % this.maxWorkers]; // simple round-robin
    
    try {
      const result = await worker.execute(agent, task, context);
      return result;
    } finally {
      this.activeCount--;
    }
  }
}
