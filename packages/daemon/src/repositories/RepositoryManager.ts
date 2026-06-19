import { RepositoryRegistry } from './RepositoryRegistry';
import { RepositoryCache } from './RepositoryCache';
import { RepositoryWatcher } from '../watchers/RepositoryWatcher';
import { RepositoryWorkspace } from './RepositoryWorkspace';

export class RepositoryManager {
  constructor(
    private registry: RepositoryRegistry,
    private cache: RepositoryCache,
    private watcher: RepositoryWatcher
  ) {}

  public async addRepository(repositoryId: string, rootPath: string): Promise<RepositoryWorkspace> {
    const workspace = await this.cache.getWorkspace(repositoryId, rootPath);
    await this.watcher.watch(repositoryId, rootPath);
    return workspace;
  }

  public async removeRepository(repositoryId: string): Promise<void> {
    await this.watcher.unwatch(repositoryId);
    this.cache.invalidateWorkspace(repositoryId);
  }

  public listRepositories(): RepositoryWorkspace[] {
    return this.registry.getAll();
  }

  public async reloadRepository(repositoryId: string): Promise<RepositoryWorkspace | undefined> {
    const existing = this.registry.get(repositoryId);
    if (!existing) return undefined;
    
    return await this.cache.reloadWorkspace(repositoryId, existing.rootPath);
  }
}
