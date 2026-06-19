// Using any types to represent data from @agent-os/repository, @agent-os/wicer, etc.
// In a fully integrated environment, we'd import RepositoryGraphSnapshot, KnowledgeUnit, Memory, RepositoryBrain

export type RepositoryWorkspace = {
  repositoryId: string;
  rootPath: string;
  graph: any; // RepositoryGraphSnapshot
  wiki: any[]; // KnowledgeUnit[]
  memories: any[]; // Memory[]
  brain: any; // RepositoryBrain
  lastIndexedAt: number;
};
