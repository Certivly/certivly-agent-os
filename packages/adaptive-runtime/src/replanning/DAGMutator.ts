import { TaskGraph } from '../../../subagents/src/coordinator/TaskGraph';
import { PlanRevision } from '../models/RuntimeObservation';

export class DAGMutator {
  public mutate(graph: TaskGraph, revision: PlanRevision) {
    // Only appending is allowed, never destructing.
    for (const add of revision.addedNodes) {
      if (add === 'patch-retry') {
        const retryId = `task-patch-retry-${Date.now()}`;
        graph.addNode({ id: retryId, agent: 'patch-agent', dependencies: [], status: 'pending', task: { id: retryId, type: 'patch', payload: {} } });
        // Assume adding it before a new test phase
        const testId = `task-test-retry-${Date.now()}`;
        graph.addNode({ id: testId, agent: 'test-agent', dependencies: [retryId], status: 'pending', task: { id: testId, type: 'test', payload: {} } });
        graph.addEdge(retryId, testId);
      }
    }
  }
}
