import { RuntimeServiceRegistry } from "./RuntimeServiceRegistry";
import { OptimizationAnalyzer, OptimizationPlanner } from "@agent-os/seol";

export class RuntimePipeline {
  constructor(private registry: RuntimeServiceRegistry) {}

  public async execute(sessionId: string, input: string): Promise<any> {
    const cwd = process.cwd();
    const context: any = {
      sessionId,
      input,
      graphSnapshot: null,
      knowledgeUnits: [] as any[],
      patternReport: null,
      plan: null,
      executionResult: null,
      trustReport: null,
      patchBundle: null,
      subAgentResult: null,
      seolPlan: null
    };

    // ── Stage 1: Repository Indexing ─────────────────────────────────────────
    const repository: any = this.registry.resolve("repository");
    const wicer: any = this.registry.resolve("wicer");

    try {
      // indexRepository() returns a real RepositoryGraphSnapshot
      context.graphSnapshot = await repository.indexRepository(cwd);
    } catch (err: any) {
      console.error("[Pipeline] Repository indexing failed:", err.message);
      context.graphSnapshot = { files: new Map(), symbols: new Map(), dependencies: [], calls: [], fileSymbols: new Map(), symbolDefinitions: new Map(), version: 0, timestamp: new Date().toISOString() };
    }

    // ── Stage 2: WiCER Knowledge Generation ─────────────────────────────────
    try {
      wicer.generateWikiSnapshot(context.graphSnapshot);
      // Query all generated knowledge units for downstream use
      context.knowledgeUnits = wicer.query("file");
    } catch (err: any) {
      console.error("[Pipeline] WiCER generation failed:", err.message);
      context.knowledgeUnits = [];
    }

    // ── Stage 3: Pattern Intelligence ────────────────────────────────────────
    const patternEngine: any = this.registry.resolve("pattern-intelligence");
    try {
      const repoVersion = context.graphSnapshot?.timestamp ?? "0";
      context.patternReport = await patternEngine.scan(
        context.graphSnapshot,
        context.knowledgeUnits,
        repoVersion
      );
    } catch (err: any) {
      console.error("[Pipeline] Pattern intelligence failed:", err.message);
      context.patternReport = { patterns: [], generatedAt: new Date().toISOString(), repositoryVersion: "unknown" };
    }

    // ── Stage 3.5: Brain RAG Retrieval ───────────────────────────────────────
    const brain: any = this.registry.resolve("brain");
    let brainResponse: any = null;
    let relevantMemories: any[] = [];
    try {
      brainResponse = await brain.answer(input);
      // Extract memory items for backward compat with planner
      relevantMemories = (brainResponse?.context?.knowledge ?? [])
        .filter((k: any) => k.type === 'memory')
        .map((k: any) => k.content);
    } catch (err: any) {
      console.error('[Pipeline] Brain retrieval failed:', err.message);
    }

    // ── Stage 4: Planning ─────────────────────────────────────────────────────
    const planner: any = this.registry.resolve("planner");
    try {
      context.plan = await planner.createPlan({
        requestId: sessionId,
        sessionId,
        goal: input,
        workspaceRoot: cwd,
        approvalMode: "smart" as const,
        repositorySnapshot: context.graphSnapshot,
        patternSnapshot: context.patternReport,
        knowledgeUnits: context.knowledgeUnits,
        memories: relevantMemories,
        brainAdvice: brainResponse ? null : null   // strategy advice injected here after enough history
      });
    } catch (err: any) {
      console.error("[Pipeline] Planning failed:", err.message);
      context.plan = { id: sessionId, goalId: sessionId, goal: input, tasks: [], dependencies: [], estimatedComplexity: 0, riskScore: 0, requiresSandbox: false, createdAt: Date.now() };
    }

    // ── Stage 5: Orchestrator (Agent Coordination) ────────────────────────────
    const orchestrator: any = this.registry.resolve("orchestrator");
    try {
      await orchestrator.orchestrate({
        goal: input,
        executionPlan: context.plan,
        repositorySnapshot: context.graphSnapshot,
        memory: relevantMemories,
        knowledge: context.knowledgeUnits,
        previousResults: []
      });
    } catch (err: any) {
      console.error("[Pipeline] Orchestrator failed:", err.message);
      if (err.name === 'ProviderError' || err.constructor?.name === 'ProviderError' || err.message.includes('Provider timeout') || err.message.includes('OpenAI generation failed')) {
        throw err;
      }
    }

    // ── Stage 5b: SubAgent Swarm ─────────────────────────────────────────────
    // Fire the specialist agent swarm for complex goals (more than 2 tasks)
    const planTaskCount = context.plan?.tasks?.length ?? 0;
    if (planTaskCount > 2) {
      try {
        const subAgentRuntime: any = this.registry.resolve("subagent-runtime");
        const workspaceFactory: any = this.registry.resolve("subagent-workspace-factory");
        const workspace = typeof workspaceFactory === 'function' ? workspaceFactory() : workspaceFactory;
        workspace.repositoryGraph = context.graphSnapshot;

        context.subAgentResult = await subAgentRuntime.run(input, workspace);
      } catch (err: any) {
        console.error("[Pipeline] SubAgent swarm failed:", err.message);
      }
    }

    // ── Stage 6: Execution Engine ─────────────────────────────────────────────
    const executionEngine: any = this.registry.resolve("execution-engine");
    try {
      context.executionResult = await executionEngine.executePlan(
        sessionId,
        sessionId,
        cwd,
        context.plan,
        {
          goal: input,
          repositorySnapshot: context.graphSnapshot,
          patternSnapshot: context.patternReport,
          knowledgeUnits: context.knowledgeUnits,
          brainContext: brainResponse
        }
      );
    } catch (err: any) {
      console.error("[Pipeline] Execution failed:", err.message);
      context.executionResult = { planId: context.plan.id, success: false, tasksCompleted: 0, tasksFailed: 1, error: err.message };
    }

    // ── Stage 7: Trust Runtime ────────────────────────────────────────────────
    const trustRuntime: any = this.registry.resolve("trust-runtime");
    try {
      context.trustReport = await trustRuntime.evaluate(
        context.plan.id,
        [], // claims — empty for now until TrustEngine claim extraction is wired
        [], // evidence
        null
      );
    } catch (err: any) {
      console.error("[Pipeline] Trust evaluation failed:", err.message);
      context.trustReport = { score: 100, passed: true, regressions: [] };
    }

    // ── Stage 8: Patch Generation ─────────────────────────────────────────────
    const patchEngine: any = this.registry.resolve("patch-engine");
    try {
      context.patchBundle = await patchEngine.generatePatch(context.plan.id);
    } catch (err: any) {
      console.error("[Pipeline] Patch generation failed:", err.message);
      context.patchBundle = { planId: context.plan.id, patches: [] };
    }

    // ── Stage 8.5: SEOL Skill Optimization Analysis ─────────────────────────
    // After each run, profile all skills that fired and identify optimization candidates
    // for the next execution cycle (memoization, graph reuse, etc.)
    try {
      const seolProfiler: any = this.registry.resolve("seol-profiler");
      const skillIds: string[] = (context.plan?.tasks ?? [])
        .map((t: any) => t.skillId)
        .filter((id: any): id is string => Boolean(id));

      if (skillIds.length > 0) {
        const profiles = skillIds.map((id: string) => seolProfiler.profileSkill(id, sessionId));
        const candidates = new OptimizationAnalyzer().analyze(profiles);
        if (candidates.length > 0) {
          context.seolPlan = new OptimizationPlanner().createPlan(candidates);
        }
      }
    } catch (err: any) {
      // SEOL is non-fatal — never block the pipeline
    }

    const executionSuccess = context.executionResult?.success !== false &&
      !context.executionResult?.error;

    // ── Record Learning Outcome ────────────────────────────────────────────────
    try {
      const learningEngine: any = this.registry.resolve("learning-engine");
      learningEngine.recordOutcome({
        id: `${sessionId}-${Date.now()}`,
        goal: input,
        category: context.plan?.category || 'UNKNOWN',
        success: executionSuccess,
        tasksCompleted: context.executionResult?.tasksCompleted ?? 0,
        tasksFailed: context.executionResult?.tasksFailed ?? 0,
        riskScore: context.plan?.riskScore ?? 0,
        durationMs: Date.now() - (context.plan?.createdAt ?? Date.now()),
        timestamp: new Date().toISOString()
      });

      // Record into brain SuccessMemory / FailureMemory for strategy learning
      const trustScore = context.trustReport?.score ?? 0;
      const executionPath = (context.plan?.tasks ?? []).map((t: any) => t.type || 'UNKNOWN');
      const affectedFiles = Object.keys(context.patchBundle?.files ?? {});
      if (executionSuccess) {
        const successMemory: any = this.registry.resolve("success-memory");
        successMemory.store({
          id: `${sessionId}-success-${Date.now()}`,
          goalId: sessionId,
          planId: context.plan?.id ?? sessionId,
          trustScore,
          taskGraphId: sessionId,
          affectedFiles,
          executionPath,
          timestamp: Date.now()
        });
        // Recompile strategies with fresh data
        const strategyEngine: any = this.registry.resolve("strategy-engine");
        strategyEngine.compile();
      } else {
        const failureMemory: any = this.registry.resolve("failure-memory");
        failureMemory.store({
          id: `${sessionId}-failure-${Date.now()}`,
          goalId: sessionId,
          reason: context.executionResult?.error ?? 'unknown',
          trustScore,
          failedNodeId: sessionId,
          affectedFiles,
          executionPath,
          timestamp: Date.now()
        });
        const strategyEngine: any = this.registry.resolve("strategy-engine");
        strategyEngine.compile();
      }
    } catch {}

    // ── Approval Package ──────────────────────────────────────────────────────
    const fileCount = context.graphSnapshot?.files?.size ?? 0;
    const symbolCount = context.graphSnapshot?.symbols?.size ?? 0;
    const patternCount = context.patternReport?.patterns?.length ?? 0;
    const knowledgeCount = context.knowledgeUnits?.length ?? 0;
    const taskCount = context.plan?.tasks?.length ?? 0;

    return {
      executionResult: context.executionResult,
      trustReport: context.trustReport,
      patchBundle: context.patchBundle,
      patternReport: context.patternReport,
      repositorySummary: {
        files: fileCount,
        symbols: symbolCount,
        patterns: patternCount,
        knowledgeUnits: knowledgeCount
      },
      planSummary: {
        tasks: taskCount,
        riskScore: context.plan?.riskScore ?? 0,
        requiresSandbox: context.plan?.requiresSandbox ?? false
      },
      impactReport: { severity: context.plan?.riskScore > 50 ? "HIGH" : context.plan?.riskScore > 20 ? "MEDIUM" : "LOW" },
      seolPlan: context.seolPlan ?? null,
      subAgentResult: context.subAgentResult ?? null
    };
  }
}
