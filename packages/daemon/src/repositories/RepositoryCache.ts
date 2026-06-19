import { RepositoryWorkspace } from './RepositoryWorkspace';
import { RepositoryRegistry } from './RepositoryRegistry';

export class RepositoryCache {
  constructor(private registry: RepositoryRegistry) {}

  public async getWorkspace(repositoryId: string, rootPath: string): Promise<RepositoryWorkspace> {
    const existing = this.registry.get(repositoryId);
    if (existing) {
      return existing;
    }

    // Load workspace
    const workspace = await this.loadWorkspace(repositoryId, rootPath);
    this.registry.register(workspace);
    return workspace;
  }

  public async updateWorkspace(repositoryId: string, updates: Partial<RepositoryWorkspace>): Promise<void> {
    const existing = this.registry.get(repositoryId);
    if (existing) {
      Object.assign(existing, updates);
      existing.lastIndexedAt = Date.now();
    }
  }

  public invalidateWorkspace(repositoryId: string): void {
    this.registry.remove(repositoryId);
  }

  public async reloadWorkspace(repositoryId: string, rootPath: string): Promise<RepositoryWorkspace> {
    this.invalidateWorkspace(repositoryId);
    return this.getWorkspace(repositoryId, rootPath);
  }

  private async loadWorkspace(repositoryId: string, rootPath: string): Promise<RepositoryWorkspace> {
    // In actual implementation, this invokes the heavy scanners and instantiates the Brain
    return {
      repositoryId,
      rootPath,
      graph: {},
      wiki: [],
      memories: [],
      brain: {},
      lastIndexedAt: Date.now()
    };
  }
}
