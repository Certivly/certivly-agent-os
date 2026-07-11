import { TaskGraph } from '../coordinator/TaskGraph';
import { TaskGraphNode } from '../models/AgentTask';
import { SubAgent } from '../agents/SubAgent';

/**
 * Dynamically builds an execution graph based on the goal string.
 * Replaces the hardcoded TaskPlanner with intent-based routing.
 */
export class DynamicTaskPlanner {
  public plan(goal: string, agents: Map<string, SubAgent>): TaskGraph {
    const graph = new TaskGraph();
    const lower = goal.toLowerCase();

    // Always start with parallel context gathering
    const gatherNodes: string[] = [];

    this.addNode(graph, 'task-search', 'search-agent', [], { q: goal });
    gatherNodes.push('task-search');

    this.addNode(graph, 'task-repo', 'repository-agent', [], { q: goal });
    gatherNodes.push('task-repo');

    this.addNode(graph, 'task-memory', 'memory-agent', [], { q: goal });
    gatherNodes.push('task-memory');

    // WiCER enrichment runs in parallel with context gathering
    if (agents.has('wicer-agent')) {
      this.addNode(graph, 'task-wicer', 'wicer-agent', [], { q: goal });
      gatherNodes.push('task-wicer');
    }

    // Patch planning depends on context gathering
    this.addNode(graph, 'task-patch', 'patch-agent', gatherNodes, { goal });
    for (const g of gatherNodes) graph.addEdge(g, 'task-patch');

    // Convention audit can run in parallel with validation
    const postPatchNodes: string[] = [];

    if (agents.has('convention-agent')) {
      this.addNode(graph, 'task-convention', 'convention-agent', ['task-patch'], {});
      graph.addEdge('task-patch', 'task-convention');
      postPatchNodes.push('task-convention');
    }

    this.addNode(graph, 'task-validate', 'validation-agent', ['task-patch'], {});
    graph.addEdge('task-patch', 'task-validate');
    postPatchNodes.push('task-validate');

    // Tests run only if the goal is not read-only
    const isReadOnly = lower.includes('search') || lower.includes('find') ||
                       lower.includes('analyze') || lower.includes('explain');

    if (!isReadOnly && agents.has('test-agent')) {
      this.addNode(graph, 'task-test', 'test-agent', postPatchNodes, {});
      for (const n of postPatchNodes) graph.addEdge(n, 'task-test');
    }

    return graph;
  }

  private addNode(
    graph: TaskGraph,
    id: string,
    agent: string,
    dependencies: string[],
    payload: any
  ): void {
    const node: TaskGraphNode = {
      id,
      agent,
      dependencies,
      status: 'pending',
      task: { id, type: agent.replace('-agent', ''), payload }
    };
    graph.addNode(node);
  }
}
