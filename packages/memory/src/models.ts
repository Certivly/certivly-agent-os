export type MemoryType = 'FactMemory' | 'DecisionMemory' | 'PatternMemory' | 'TaskMemory' | 'ObservationMemory' | 'RelationshipMemory';

export interface Memory {
  id: string;
  type: MemoryType;
  topic: string;
  content: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceRequestIds: string[];
  tags: string[];
  version: number;
}
