/**
 * ARCHIVED PACKAGE: @agent-os/brain
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Not imported by AgentLoop; live path uses repo_map + grep tools instead
 *
 * Revival condition: Eval showing ≥15% task pass-rate improvement with Brain retrieval active
 *
 * To revive: move this directory back to packages/brain/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

// Reason: Not imported by any live-path package. AgentLoop uses repo_map + grep tools
// for repository intelligence instead of the full RAG/WiCER stack.
// Revival condition: eval benchmark showing >=15% retrieval precision improvement
// on the edit/verify/patch task suite.

// ─── Models ──────────────────────────────────────────────────────────────────
export * from './models';

// ─── RAG Retrieval Engine ─────────────────────────────────────────────────────
export * from './KnowledgeRetriever';
export * from './QueryClassifier';
export * from './RetrievalPlanner';
export * from './KnowledgeScorer';
export * from './KnowledgeRanker';
export * from './RepositoryBrain';
export * from './LearningFeedbackEngine';

// Retrievers
export * from './retrieval/HybridRetriever';
export * from './retrieval/GraphRetriever';
export * from './retrieval/WikiRetriever';
export * from './retrieval/MemoryRetriever';
export * from './retrieval/EventRetriever';

// ─── Strategy / Pattern Learning Engine ──────────────────────────────────────
export * from './strategy/StrategyEngine';
export * from './strategy/StrategyCompiler';
export * from './strategy/StrategyStore';
export * from './strategy/StrategyRanker';
export * from './strategy/StrategyQueryEngine';
export * from './strategy/FailureAvoidanceEngine';
export * from './strategy/PlanningAdvisor';
export * from './strategy/GoalFingerprintEngine';
export * from './strategy/SimilarGoalFinder';
export * from './strategy/ExecutionPathAnalyzer';

// ─── Memory ───────────────────────────────────────────────────────────────────
export * from './memory/SuccessMemory';
export * from './memory/FailureMemory';

// ─── Context (merged from @agent-os/context) ─────────────────────────────────
export * from './context/models';
export * from './context/ContextStack';
export * from './context/ContextAssembler';

// ─── Learning & Optimization (merged from @agent-os/seol) ────────────────────
export * from './learning/LearningEngine';
export * from './learning/types';
export * from './learning/errors';
export * from './learning/ExecutionProfiler';
export * from './learning/OptimizationAnalyzer';
export * from './learning/OptimizationPlanner';
export * from './learning/CacheManager';
export * from './learning/ContextReuseManager';
export * from './learning/SkillOptimizationProxy';
export * from './learning/EquivalenceTester';
export * from './learning/OptimizationValidator';
export * from './learning/OptimizationMetrics';

// ─── Conventions ─────────────────────────────────────────────────────────────
export * from './conventions/ConventionEngine';
