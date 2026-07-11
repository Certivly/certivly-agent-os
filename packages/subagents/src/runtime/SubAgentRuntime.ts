import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from '../agents/SubAgent';
import { SearchAgent } from '../agents/SearchAgent';
import { RepositoryAgent } from '../agents/RepositoryAgent';
import { MemoryAgent } from '../agents/MemoryAgent';
import { PatchAgent } from '../agents/PatchAgent';
import { ValidationAgent } from '../agents/ValidationAgent';
import { TestAgent } from '../agents/TestAgent';
import { WiCERAgent } from '../agents/WiCERAgent';
import { ConventionAgent } from '../agents/ConventionAgent';
import { DynamicTaskPlanner } from '../coordinator/DynamicTaskPlanner';
import { WorkerPool } from './WorkerPool';
import { FailureHandler, FailurePolicy } from '../orchestration/FailureHandler';
import { ParallelExecutor } from '../orchestration/ParallelExecutor';
import { ResultSynthesizer, FinalAgentResponse } from '../coordinator/ResultSynthesizer';
import { TaskGraph } from '../coordinator/TaskGraph';

export interface SubAgentRuntimeOptions {
  maxWorkers?: number;
  failurePolicy?: FailurePolicy;
}

/**
 * Top-level SubAgent runtime.
 *
 * Takes a goal + workspace context, builds a dynamic task graph,
 * executes agents in parallel (respecting dependencies), and returns
 * a synthesized response.
 */
export class SubAgentRuntime {
  private agents: Map<string, SubAgent>;
  private planner: DynamicTaskPlanner;
  private executor: ParallelExecutor;
  private synthesizer: ResultSynthesizer;

  constructor(opts: SubAgentRuntimeOptions = {}) {
    const allAgents: SubAgent[] = [
      new SearchAgent(),
      new RepositoryAgent(),
      new MemoryAgent(),
      new PatchAgent(),
      new ValidationAgent(),
      new TestAgent(),
      new WiCERAgent(),
      new ConventionAgent()
    ];

    this.agents = new Map(allAgents.map(a => [a.id, a]));
    this.planner = new DynamicTaskPlanner();
    this.synthesizer = new ResultSynthesizer();

    const workerPool = new WorkerPool(opts.maxWorkers ?? 8);
    const failureHandler = new FailureHandler(opts.failurePolicy ?? FailurePolicy.CONTINUE);
    this.executor = new ParallelExecutor(workerPool, failureHandler, this.agents);
  }

  public async run(goal: string, workspace: AgentContext['workspace']): Promise<FinalAgentResponse> {
    const context: AgentContext = {
      workspace,
      executionId: `exec_${Date.now()}`,
      sessionId: `session_${Date.now()}`
    };

    // 1. Build execution graph
    const graph = this.planner.plan(goal, this.agents);

    // 2. Inject goal into all pending nodes
    this.propagateGoal(graph, goal, workspace);

    // 3. Execute in parallel, respecting dependencies
    await this.executor.executeGraph(graph, context);

    // 4. Propagate upstream results into downstream payloads
    this.propagateResults(graph);

    // 5. Re-run downstream nodes with enriched payloads (second pass)
    // (first pass already ran them, results are merged for synthesis)

    // 6. Collect all results and synthesize
    const results = Array.from(graph.nodes.values())
      .filter(n => n.result != null)
      .map(n => n.result!);

    return this.synthesizer.synthesize(results);
  }

  private propagateGoal(graph: TaskGraph, goal: string, workspace: any): void {
    for (const [, node] of graph.nodes) {
      node.task.payload = { ...node.task.payload, goal };
    }
  }

  private propagateResults(graph: TaskGraph): void {
    const searchNode = graph.getNode('task-search');
    const repoNode = graph.getNode('task-repo');
    const memoryNode = graph.getNode('task-memory');
    const patchNode = graph.getNode('task-patch');
    const validationNode = graph.getNode('task-validate');
    const conventionNode = graph.getNode('task-convention');
    const testNode = graph.getNode('task-test');

    // Enrich patch node payload with upstream results
    if (patchNode) {
      patchNode.task.payload = {
        ...patchNode.task.payload,
        searchResults: searchNode?.result?.data ?? {},
        repoResults: repoNode?.result?.data ?? {},
        memoryResults: memoryNode?.result?.data ?? {}
      };
    }

    // Enrich validation and convention with patch results
    const patchData = patchNode?.result?.data ?? {};
    if (validationNode) {
      validationNode.task.payload = {
        ...validationNode.task.payload,
        patchPlan: patchData.patchPlan ?? [],
        affectedFiles: patchData.affectedFiles ?? []
      };
    }
    if (conventionNode) {
      conventionNode.task.payload = {
        ...conventionNode.task.payload,
        patchPlan: patchData.patchPlan ?? [],
        affectedFiles: patchData.affectedFiles ?? []
      };
    }

    // Enrich test node with affected files
    if (testNode) {
      testNode.task.payload = {
        ...testNode.task.payload,
        affectedFiles: patchData.affectedFiles ?? []
      };
    }
  }
}
