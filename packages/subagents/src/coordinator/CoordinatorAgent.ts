import { TaskPlanner } from './TaskPlanner';
import { ParallelExecutor } from '../orchestration/ParallelExecutor';
import { ResultSynthesizer, FinalAgentResponse } from './ResultSynthesizer';
import { AgentContext } from '../runtime/AgentContext';

export class CoordinatorAgent {
  constructor(
    private planner: TaskPlanner,
    private executor: ParallelExecutor,
    private synthesizer: ResultSynthesizer
  ) {}

  public async orchestrate(request: string, context: AgentContext): Promise<FinalAgentResponse> {
    // 1. Build Task Graph
    const graph = this.planner.plan(request);

    // 2. Dispatch subagents in parallel
    await this.executor.executeGraph(graph, context);

    if (graph.hasFailed()) {
      throw new Error("Orchestration failed due to subagent failure");
    }

    // 3. Collect and merge outputs
    const results = Array.from(graph.nodes.values()).map(n => n.result).filter(r => !!r);
    
    return this.synthesizer.synthesize(results);
  }
}
