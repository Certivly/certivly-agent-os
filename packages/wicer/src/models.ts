export interface KnowledgeUnit {
  id: string;
  type: 'file' | 'symbol' | 'module' | 'system';
  title: string;
  content: string;
  sourceGraphRefs: string[];
  sourceEventRefs: string[];
  createdAt: number;
  version: number;
}

export interface ImpactReport {
  targetId: string;
  targetType: 'file' | 'symbol';
  dependentFiles: string[];
  dependentSymbols: string[];
  cascadeChain: string[];
}

export interface ExecutionNarrative {
  id: string;
  startTime: number;
  endTime: number;
  events: string[];
  narrativeText: string;
}
