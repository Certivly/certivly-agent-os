import { RuntimePool } from './RuntimePool';
import { RepositoryCache } from '../repositories/RepositoryCache';

export interface SessionState {
  id: string;
  clientId: string;
  repositoryId: string;
}

export class SessionCoordinator {
  private sessions = new Map<string, SessionState>();

  constructor(
    private runtimePool: RuntimePool,
    private repositoryCache: RepositoryCache
  ) {}

  public async createSession(clientId: string, repositoryId: string, rootPath: string): Promise<string> {
    const sessionId = `session_${Date.now()}`;
    
    // Ensure repository workspace is loaded
    await this.repositoryCache.getWorkspace(repositoryId, rootPath);
    
    // Acquire a runtime for this session
    this.runtimePool.acquireRuntime(sessionId);

    this.sessions.set(sessionId, { id: sessionId, clientId, repositoryId });

    return sessionId;
  }

  public endSession(sessionId: string): void {
    this.runtimePool.releaseRuntime(sessionId);
    this.sessions.delete(sessionId);
  }

  public getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }
}
