import { RepositoryWorkspace } from './RepositoryWorkspace';

export class RepositoryRegistry {
  private workspaces = new Map<string, RepositoryWorkspace>();

  public register(workspace: RepositoryWorkspace): void {
    this.workspaces.set(workspace.repositoryId, workspace);
  }

  public get(repositoryId: string): RepositoryWorkspace | undefined {
    return this.workspaces.get(repositoryId);
  }

  public remove(repositoryId: string): boolean {
    return this.workspaces.delete(repositoryId);
  }

  public getAll(): RepositoryWorkspace[] {
    return Array.from(this.workspaces.values());
  }

  public clear(): void {
    this.workspaces.clear();
  }
}
