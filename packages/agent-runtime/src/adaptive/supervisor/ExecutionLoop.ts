import { Goal } from '../models/Goal';
import { RuntimeState } from '../models/RuntimeState';
import { ObservationEngine } from '../observation/ObservationEngine';
import { FailureAnalyzer } from '../observation/FailureAnalyzer';
import { PlanRevisionEngine } from '../replanning/PlanRevisionEngine';
import { VerificationEngine } from '../verification/VerificationEngine';
import { CompletionChecker } from '../verification/CompletionChecker';
import { AdaptivePlanner } from '../replanning/AdaptivePlanner';
import { TaskGraph, ParallelExecutor } from '@agent-os/subagents';
import { ExecutionCycle } from '../models/RuntimeObservation';

export class ExecutionLoop {
  constructor(
    private planner: AdaptivePlanner,
    private executor: ParallelExecutor,
    private observer: ObservationEngine,
    private failureAnalyzer: FailureAnalyzer,
    private revisionEngine: PlanRevisionEngine,
    private verifier: VerificationEngine,
    private checker: CompletionChecker
  ) {}

  public async runUntilComplete(goal: Goal, context: any): Promise<void> {
    goal.status = "running";
    let state = RuntimeState.PLANNING;
    let graph: TaskGraph = this.planner.generateInitialPlan(goal);

    let cycleNumber = 0;
    const maxCycles = 10;

    while (goal.status === "running" && cycleNumber < maxCycles) {
      cycleNumber++;
      const cycle: ExecutionCycle = { cycleNumber, observations: [], revisions: [], completedTasks: [] };

      // Execute DAG
      state = RuntimeState.EXECUTING;
      await this.executor.executeGraph(graph, context);

      // Collect Results and Observe
      state = RuntimeState.OBSERVING;
      const results = Array.from(graph.nodes.values()).map(n => n.result).filter(r => !!r);
      cycle.completedTasks = results.map(r => r.taskId);

      const testFailure = results.find(r => r.agentId === 'test-agent' && r.data?.failed > 0);
      if (testFailure) {
        this.observer.observe('test_failure', 'test-agent', testFailure);
      }

      const recentObs = this.observer.getRecentObservations();
      cycle.observations = [...recentObs];

      // Verify
      state = RuntimeState.VERIFYING;
      this.verifier.verify(goal, results);
      const completion = this.checker.check(goal);

      if (completion.completed) {
        state = RuntimeState.COMPLETED;
        break;
      }

      // Replan if needed
      state = RuntimeState.REPLANNING;
      for (const obs of recentObs) {
        const analysis = this.failureAnalyzer.analyze(obs);
        if (analysis.suggestedAction === 'replan') {
          const revision = this.revisionEngine.revise(graph, obs);
          if (revision) {
            cycle.revisions.push(revision);
          }
        }
      }

      this.observer.clear();

      if (cycle.revisions.length === 0) {
        // No replan possible, fail goal
        goal.status = "failed";
        state = RuntimeState.FAILED;
        break;
      }
    }
  }
}
