// ─── Brain RAG Models ───────────────────────────────────────────────────────

export enum QueryType {
  ARCHITECTURE = 'ARCHITECTURE',
  SYMBOL = 'SYMBOL',
  DEPENDENCY = 'DEPENDENCY',
  EXECUTION = 'EXECUTION',
  HISTORY = 'HISTORY',
  CONVENTION = 'CONVENTION',
  BUG = 'BUG',
  FEATURE = 'FEATURE',
  UNKNOWN = 'UNKNOWN'
}

export type BrainQuery = {
  query: string;
  intent: QueryType;
  scope?: string[];
  limit?: number;
};

export type KnowledgeConfidence = {
  score: number;
  sources: string[];
  traceable: boolean;
};

export type KnowledgeSourceType = 'graph' | 'wicer' | 'memory' | 'event';

export type KnowledgeItem = {
  id: string;
  type: KnowledgeSourceType;
  content: any;
  confidence: KnowledgeConfidence;
  distance?: number;
  frequencyScore?: number;
  recencyScore?: number;
  finalScore?: number;
};

export type RankedKnowledge = KnowledgeItem & { finalScore: number };

export type RepositoryIntelligenceScore = {
  graphCoverage: number;
  wikiCoverage: number;
  memoryCoverage: number;
  retrievalCoverage: number;
  confidence: number;
};

export type BrainAgentContext = {
  query: BrainQuery;
  knowledge: RankedKnowledge[];
  score: RepositoryIntelligenceScore;
  assembledText: string;
};

export type BrainResponse = {
  context: BrainAgentContext;
  assembledText: string;
};

// ─── Record Models (used by SuccessMemory / FailureMemory / StrategyCompiler) ─

export interface SuccessRecord {
  id: string;
  goalId: string;
  planId: string;
  trustScore: number;
  taskGraphId: string;
  affectedFiles: string[];
  executionPath: string[];
  timestamp: number;
}

export interface FailureRecord {
  id: string;
  goalId: string;
  reason: string;
  trustScore: number;
  failedNodeId: string;
  affectedFiles: string[];
  executionPath: string[];
  timestamp: number;
}

// ─── Strategy Models (brain-v2) ───────────────────────────────────────────────

export interface Strategy {
  id: string;
  name: string;
  executionPath: string[];
  successRate: number;
  failureRate: number;
  trustAverage: number;
  executions: number;
  evidenceIds: string[];
}

export interface PlanningAdvice {
  recommendedStrategy: string | null;
  confidence: number;
  reasoning: string[];
  evidenceIds: string[];
}

export interface GoalSignature {
  action: string;
  domain: string;
  targetType: string;
  repositoryAreas: string[];
}

export interface AvoidanceRule {
  strategyIdToAvoid: string | null;
  path: string[];
  failureRate: number;
  reason: string;
}
