import { TaskGraph } from './TaskGraph';
import { DependencyResolver } from './DependencyResolver';
import { AgentTask } from '../models/AgentTask';

export class TaskPlanner {
  constructor(private resolver: DependencyResolver) {}

  public plan(request: string): TaskGraph {
    const graph = new TaskGraph();

    // Mock static execution plan mapping for Phase 8.4
    // Input: Fix login bug
    // SearchAgent, RepositoryAgent, MemoryAgent -> PatchAgent -> ValidationAgent -> TestAgent

    graph.addNode({ id: 'task-search', agent: 'search-agent', dependencies: [], status: 'pending', task: { id: 'task-search', type: 'search', payload: { q: request } } });
    graph.addNode({ id: 'task-repo', agent: 'repository-agent', dependencies: [], status: 'pending', task: { id: 'task-repo', type: 'repo', payload: { q: request } } });
    graph.addNode({ id: 'task-memory', agent: 'memory-agent', dependencies: [], status: 'pending', task: { id: 'task-memory', type: 'memory', payload: { q: request } } });
    
    graph.addNode({ id: 'task-patch', agent: 'patch-agent', dependencies: ['task-search', 'task-repo', 'task-memory'], status: 'pending', task: { id: 'task-patch', type: 'patch', payload: {} } });
    graph.addNode({ id: 'task-validate', agent: 'validation-agent', dependencies: ['task-patch'], status: 'pending', task: { id: 'task-validate', type: 'validate', payload: {} } });
    graph.addNode({ id: 'task-test', agent: 'test-agent', dependencies: ['task-validate'], status: 'pending', task: { id: 'task-test', type: 'test', payload: {} } });

    graph.addEdge('task-search', 'task-patch');
    graph.addEdge('task-repo', 'task-patch');
    graph.addEdge('task-memory', 'task-patch');
    graph.addEdge('task-patch', 'task-validate');
    graph.addEdge('task-validate', 'task-test');

    // Ensure DAG is valid
    this.resolver.resolve(graph);

    return graph;
  }
}
