export interface AgentWorkspace {
  repositoryGraph: any; // RepositoryGraphSnapshot
  wicer: any; // WicerAPI
  memory: any; // MemoryEngine
  brain: any; // RepositoryBrain
  eventStore: any; // EventStore
  metrics: any; // MetricRegistry
}

export interface AgentContext {
  workspace: AgentWorkspace;
  executionId: string;
  sessionId: string;
}
