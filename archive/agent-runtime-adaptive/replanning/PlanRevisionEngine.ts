import { TaskGraph } from '@agent-os/subagents';
import { RuntimeObservation, PlanRevision } from '../models/RuntimeObservation';
import { DAGMutator } from './DAGMutator';

export class PlanRevisionEngine {
  constructor(private mutator: DAGMutator) {}

  public revise(graph: TaskGraph, observation: RuntimeObservation): PlanRevision | null {
    if (observation.type === 'test_failure') {
      const revision: PlanRevision = {
        id: `rev-${Date.now()}`,
        originalNodes: Array.from(graph.nodes.keys()),
        addedNodes: ['patch-retry'],
        reason: 'test failed, retrying patch'
      };
      this.mutator.mutate(graph, revision);
      return revision;
    }
    return null;
  }
}
