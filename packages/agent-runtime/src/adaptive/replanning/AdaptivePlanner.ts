import { TaskGraph } from '@agent-os/subagents';
import { Goal } from '../models/Goal';

export class AdaptivePlanner {
  constructor(private brainQueryEngine?: any, private planningAdvisor?: any) {}

  public generateInitialPlan(goal: Goal): TaskGraph {
    let context = {};
    if (this.brainQueryEngine) {
      context = {
        successPatterns: this.brainQueryEngine.getSuccessPatterns(),
        failurePatterns: this.brainQueryEngine.getFailurePatterns(),
        similarGoals: this.brainQueryEngine.findSimilarGoals(goal.description),
        conventions: this.brainQueryEngine.getRepositoryConventions()
      };
    }

    let decision = { strategyUsed: false, strategyId: null, reason: "Default fallback" };

    if (this.planningAdvisor) {
      const advice = this.planningAdvisor.advise();
      if (advice.recommendedStrategy) {
        decision = {
          strategyUsed: true,
          strategyId: advice.recommendedStrategy,
          reason: `Recommended by advisor with confidence ${advice.confidence}. Reasoning: ${advice.reasoning.join(", ")}`
        };
      }
    }

    const graph = new TaskGraph();
    // Default initial plan
    graph.addNode({ id: 'task-search', agent: 'search-agent', dependencies: [], status: 'pending', task: { id: 'task-search', type: 'search', payload: {} } });
    graph.addNode({ id: 'task-patch', agent: 'patch-agent', dependencies: ['task-search'], status: 'pending', task: { id: 'task-patch', type: 'patch', payload: {} } });
    graph.addNode({ id: 'task-validate', agent: 'validation-agent', dependencies: ['task-patch'], status: 'pending', task: { id: 'task-validate', type: 'validate', payload: {} } });
    graph.addNode({ id: 'task-test', agent: 'test-agent', dependencies: ['task-validate'], status: 'pending', task: { id: 'task-test', type: 'test', payload: {} } });

    graph.addEdge('task-search', 'task-patch');
    graph.addEdge('task-patch', 'task-validate');
    graph.addEdge('task-validate', 'task-test');

    return graph;
  }
}
