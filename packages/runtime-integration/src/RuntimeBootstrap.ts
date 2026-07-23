import { RuntimeServiceRegistry } from "./RuntimeServiceRegistry";
import { RuntimeExecutionTracer } from "./RuntimeExecutionTracer";
import { RuntimePipeline } from "./RuntimePipeline";
import { Provider, Model } from "@agent-os/providers";
import {
  RepositoryBrain,
  StrategyEngine,
  SuccessMemory,
  FailureMemory,
  HybridRetriever,
  GraphRetriever,
  WikiRetriever,
  MemoryRetriever,
  EventRetriever
} from "@agent-os/brain";
import { McpRegistry } from "../../mcp/src/index";
import { ParserRegistry } from "../../parser/src/index";
import { ASTPatchValidator } from "../../patch-engine/src/ast/ASTPatchValidator";
import { ConventionEngine } from "../../brain/src/conventions/ConventionEngine";
import { ValidationCoordinator } from "../../execution-engine/src/ValidationCoordinator";
import { ApprovalCoordinator } from "../../execution-engine/src/ApprovalCoordinator";
import { FailureAnalyzer } from "../../execution-engine/src/FailureAnalyzer";
import { RetryManager } from "../../execution-engine/src/RetryManager";

// Core Engine Dependencies
import { EventStore } from "@agent-os/events";
import { MemoryStore } from "@agent-os/memory";
import { SandboxManager } from "@agent-os/sandbox";
import { LoggingEventBus } from "@agent-os/shared";
import { MetricRegistry } from "@agent-os/metrics";

// Advanced Packages
import { RepositoryIndexer } from "@agent-os/repository";
import { WicerAPI } from "@agent-os/wicer";
import { 
  PatternEngine, PatternRegistry, PatternCompiler, 
  PatternStore, PatternEvents, PatternMetrics 
} from "@agent-os/pattern-intelligence";
import { 
  Planner, GoalAnalyzer, PlanBuilder, PlanValidator, 
  ExecutionCoordinator, PlannerEvents, PlannerMetrics 
} from "@agent-os/planner";
import { 
  AgentCoordinator, AgentRouter, AgentRegistry, 
  AgentLifecycle, AgentEvents, AgentMetrics, 
  AgentConversation, AgentReplay, AgentConsensus,
  ArchitectAgent, CoderAgent, ResearchAgent
} from "@agent-os/orchestrator";
import { ExecutionEngine, PlanExecutor, TaskDispatcher, ExecutionEvents, ExecutionMetrics } from "@agent-os/execution-engine";
import { SkillRegistry } from "@agent-os/skills";
import { RuntimeSkillDispatcher, AnalyzeRepositorySkill, SearchCodebaseSkill } from "@agent-os/skills";

import { TrustEngine } from "../../trust-runtime/src/trust/TrustEngine";
import { TrustScoreCalculator } from "../../trust-runtime/src/trust/TrustScoreCalculator";
import { VerificationEngine } from "../../trust-runtime/src/verification/VerificationEngine";
import { ContradictionDetector } from "../../trust-runtime/src/contradictions/ContradictionDetector";

import { PatchEngine } from "@agent-os/patch-engine/src/patch/PatchEngine";
import { PatchValidator } from "@agent-os/patch-engine/src/patch/PatchValidator";
import { PatchExecutor } from "@agent-os/patch-engine/src/patch/PatchExecutor";
import { PatchRollback } from "@agent-os/patch-engine/src/patch/PatchRollback";
import { PatchStore } from "@agent-os/patch-engine/src/store/PatchStore";
import { PatchLineageTracker } from "@agent-os/patch-engine/src/lineage/PatchLineage";
import { LearningEngine } from "@agent-os/brain";
import { SubAgentRuntime } from "@agent-os/subagents";
import { ExecutionProfiler, OptimizationAnalyzer, OptimizationPlanner, CacheManager } from "@agent-os/seol";
import { WorkspaceConsistencyValidator } from "@agent-os/hardening";

export class RuntimeBootstrap {
  private tracer = new RuntimeExecutionTracer();
  private registry = new RuntimeServiceRegistry(this.tracer);
  private eventBus = new LoggingEventBus();
  private metricRegistry = new MetricRegistry();

  public async bootstrap(provider?: Provider, model?: Model): Promise<RuntimePipeline> {
    const cwd = process.cwd();

    // 1. Core Infrastructure
    const eventStore = new EventStore(':memory:');
    const memoryStore = new MemoryStore(':memory:');
    const sandboxManager = new SandboxManager(eventStore, cwd);
    
    this.registry.register("event-store", eventStore);
    this.registry.register("memory-store", memoryStore);
    this.registry.register("sandbox-manager", sandboxManager);
    
    if (provider) this.registry.register("provider", provider);
    if (model) this.registry.register("model", model);

    // 2. Repository & WiCER
    const repository = new RepositoryIndexer(eventStore);
    this.registry.register("repository", repository);

    const wicer = new WicerAPI(eventStore);
    this.registry.register("wicer", wicer);

    // 3. Pattern Intelligence
    const patternEngine = new PatternEngine(
      new PatternRegistry(),
      new PatternCompiler(),
      new PatternStore(),
      new PatternEvents(this.eventBus),
      new PatternMetrics(this.metricRegistry)
    );
    this.registry.register("pattern-intelligence", patternEngine);

    // 4. Planner
    const planner = new Planner(
      new GoalAnalyzer(),
      new PlanBuilder(),
      new PlanValidator(),
      new ExecutionCoordinator(),
      new PlannerEvents(this.eventBus),
      new PlannerMetrics(this.metricRegistry)
    );
    this.registry.register("planner", planner);

    // 5. Orchestrator — populate AgentRegistry with real agents
    const agentRegistry = new AgentRegistry();
    // Agents need the active model for LLM calls; resolved lazily
    let agentModel: any = undefined;
    try { agentModel = this.registry.resolve("model"); } catch {}
    agentRegistry.register(new ArchitectAgent(agentModel));
    agentRegistry.register(new CoderAgent(agentModel));
    agentRegistry.register(new ResearchAgent(agentModel));

    const orchestrator = new AgentCoordinator(
      agentRegistry,
      new AgentRouter(),
      new AgentConsensus(),
      new AgentEvents(this.eventBus),
      new AgentMetrics(this.metricRegistry)
    );
    this.registry.register("orchestrator", orchestrator);

    // 6. Skills
    const skills = new SkillRegistry();
    // Register built-in skills
    skills.register(new AnalyzeRepositorySkill());
    skills.register(new SearchCodebaseSkill());
    this.registry.register("skills", skills);

    // Build RuntimeSkillDispatcher that bridges TaskDispatcher → SkillRegistry
    const skillExecutor = new RuntimeSkillDispatcher(skills, repository, wicer, eventStore);

    const parserRegistry = new ParserRegistry();
    const astValidator = new ASTPatchValidator(parserRegistry);
    const conventionEngine = new ConventionEngine();
    const patchValidator = new PatchValidator(astValidator, conventionEngine);

    const patchEngine = new PatchEngine(
      patchValidator,
      new PatchExecutor(),
      new PatchRollback(),
      new PatchStore(),
      new PatchLineageTracker(),
      sandboxManager
    );
    this.registry.register("patch-engine", patchEngine);

    // 8. Trust Runtime (instantiated before execution-engine to satisfy ApprovalCoordinator dependency)
    const trustRuntime = new TrustEngine(
      new TrustScoreCalculator(),
      new VerificationEngine(),
      new ContradictionDetector()
    );
    this.registry.register("trust-runtime", trustRuntime);

    // 9. Brain — must come before TaskDispatcher
    const successMemory = new SuccessMemory();
    const failureMemory = new FailureMemory();
    const strategyEngine = new StrategyEngine(successMemory, failureMemory);
    this.registry.register("strategy-engine", strategyEngine);
    this.registry.register("success-memory", successMemory);
    this.registry.register("failure-memory", failureMemory);

    const hybridRetriever = new HybridRetriever([
      new GraphRetriever(repository as any),
      new WikiRetriever(wicer as any),
      new MemoryRetriever(memoryStore as any),
      new EventRetriever(eventStore as any)
    ]);
    const repositoryBrain = new RepositoryBrain(hybridRetriever);
    this.registry.register("brain", repositoryBrain);

    // 10. Execution Engine
    let activeModel: any = undefined;
    try {
      activeModel = this.registry.resolve("model");
    } catch {}

    const validationCoordinator = new ValidationCoordinator(sandboxManager);
    const approvalCoordinator = new ApprovalCoordinator(patchEngine, trustRuntime, wicer);
    const failureAnalyzer = new FailureAnalyzer();
    const retryManager = new RetryManager(failureAnalyzer);

    const taskDispatcher = new TaskDispatcher(
      skillExecutor,
      sandboxManager,
      patchEngine,
      approvalCoordinator,
      activeModel,
      memoryStore,
      repositoryBrain
    );

    const planExecutor = new PlanExecutor(
      taskDispatcher,
      new ExecutionEvents(this.eventBus),
      new ExecutionMetrics(this.metricRegistry),
      retryManager,
      validationCoordinator,
      approvalCoordinator,
      sandboxManager
    );
    const executionEngine = new ExecutionEngine(planExecutor);
    this.registry.register("execution-engine", executionEngine);

    // 11. MCP registry
    const mcpRegistry = new McpRegistry(eventStore);
    this.registry.register("mcp", mcpRegistry);

    // 13. Learning Engine
    const learningEngine = new LearningEngine();
    this.registry.register("learning-engine", learningEngine);

    // 14. SubAgent Runtime — seeded with workspace services
    const subAgentRuntime = new SubAgentRuntime({ maxWorkers: 8 });
    this.registry.register("subagent-runtime", subAgentRuntime);
    // Workspace builder for when pipeline runs subagent swarm
    this.registry.register("subagent-workspace-factory", () => ({
      repositoryGraph: null,     // populated per-request by pipeline
      wicer,
      memory: memoryStore,
      brain: repositoryBrain,
      eventStore,
      metrics: this.metricRegistry
    }));

    // 15. SEOL — Skill Execution Optimization Layer
    const seolProfiler = new ExecutionProfiler(eventStore);
    const seolCache = new CacheManager();
    this.registry.register("seol-profiler", seolProfiler);
    this.registry.register("seol-cache", seolCache);
    
    // 16. Hardening Diagnostics
    this.registry.register("hardening-validator", new WorkspaceConsistencyValidator());

    return new RuntimePipeline(this.registry);
  }

  public getTracer(): RuntimeExecutionTracer {
    return this.tracer;
  }
  
  public getRegistry(): RuntimeServiceRegistry {
    return this.registry;
  }

  public getEventBus(): LoggingEventBus {
    return this.eventBus;
  }
}
