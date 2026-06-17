import { RuntimeEvent } from '@agent-os/events';

export type ContextType = 'TaskContext' | 'FileContext' | 'ToolContext' | 'DecisionContext' | 'ErrorContext' | 'ObservationContext' | 'MessageContext';

export interface ContextEntry {
  id: string;
  type: ContextType;
  content: string;
  timestamp: string;
  sourceEventIds: string[];
  sourceRequestIds: string[];
  sourceSessionIds: string[];
  origin?: string;
  metadata?: Record<string, any>;
}

export interface ContextSnapshot {
  id: string;
  timestamp: string;
  entries: ContextEntry[];
}

export interface ContextPolicy {
  maxEntries: number;
  maxTokens?: number; // approximate
}

export interface MemoryExtractor {
  extractAndStore(entry: ContextEntry): Promise<void>;
}
