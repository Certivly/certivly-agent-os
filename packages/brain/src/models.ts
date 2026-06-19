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
  content: any; // Will hold GraphEvidence, KnowledgeUnit, Memory, or RuntimeEvent
  confidence: KnowledgeConfidence;
  distance?: number;
  frequencyScore?: number;
  recencyScore?: number;
  finalScore?: number;
};

export type RankedKnowledge = KnowledgeItem & {
  finalScore: number;
};

export type RepositoryIntelligenceScore = {
  graphCoverage: number;
  wikiCoverage: number;
  memoryCoverage: number;
  retrievalCoverage: number;
  confidence: number;
};

export type AgentContext = {
  query: BrainQuery;
  knowledge: RankedKnowledge[];
  score: RepositoryIntelligenceScore;
};

export type BrainResponse = {
  context: AgentContext;
  assembledText: string;
};
