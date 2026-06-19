import { AgentContext, AgentExecutionPlan, AgentResult } from "./models";
import { AgentRegistry } from "./AgentRegistry";
import { AgentRouter } from "./AgentRouter";
import { AgentConsensus } from "./AgentConsensus";
import { AgentLifecycle } from "./AgentLifecycle";
import { AgentConversation } from "./AgentConversation";
import { ExecutionPlan, TaskType } from "@agent-os/planner";
import { v4 as uuidv4 } from "uuid";

export class AgentCoordinator {
  constructor(
    private registry: AgentRegistry,
    private router: AgentRouter,
    private consensus: AgentConsensus,
    private events: any,
    private metrics: any
  ) {}

  public async orchestrate(context: AgentContext): Promise<AgentExecutionPlan> {
    const lifecycle = new AgentLifecycle();
    const conversation = new AgentConversation();
    const results: AgentResult[] = [];
    
    this.events.emitWorkflowStarted(context.goal);

    // Route agents based on goal
    const sequence = this.router.route(context.goal);

    for (const role of sequence) {
      const agent = this.registry.getAgent(role);
      
      lifecycle.transitionToRunning(role);
      this.events.emitAgentStarted(agent.id, role);

      // Simple single-pass logic for orchestrating and providing context
      const currentContext = { ...context, previousResults: results };

      try {
        const result = await agent.execute(currentContext);
        results.push(result);
        
        lifecycle.transitionToCompleted(role);
        this.events.emitAgentCompleted(agent.id, role);
        this.metrics.recordAgentExecution(role);
      } catch (err: any) {
        lifecycle.transitionToFailed(role);
        this.events.emitAgentFailed(agent.id, role, err.message);
        this.metrics.recordAgentFailure(role);
        throw err;
      }
    }

    lifecycle.transitionToConsensus();
    this.events.emitConsensusStarted();
    
    const consensusDecision = this.consensus.evaluate(results);
    
    this.events.emitConsensusCompleted(consensusDecision.approved);
    this.metrics.recordConsensusConfidence(consensusDecision.confidence);

    if (!consensusDecision.approved) {
      throw new Error(`Consensus failed: ${consensusDecision.concerns.join(", ")}`);
    }

    lifecycle.transitionToFinished();
    this.events.emitWorkflowCompleted();

    // Map Agent consensus into ExecutionPlan tasks (simplified mapping for demo)
    const plan: ExecutionPlan = {
      id: uuidv4(),
      goalId: "goal-1",
      goal: context.goal,
      tasks: [
        { id: "T1", type: TaskType.SKILL, title: "Execute Agent Blueprint", dependencies: [], assignedSkill: "coder-skill", status: "pending" }
      ],
      dependencies: [],
      estimatedComplexity: 10,
      riskScore: consensusDecision.concerns.length > 0 ? 5 : 1,
      requiresSandbox: true,
      createdAt: Date.now()
    };

    return {
      plan,
      agentResults: results,
      consensusSummary: `Consensus approved with confidence ${consensusDecision.confidence}`
    };
  }
}
