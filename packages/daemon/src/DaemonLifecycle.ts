import { AgentDaemon } from './AgentDaemon';
import { SessionRecovery } from './sessions/SessionRecovery';
import { StateStore } from './persistence/StateStore';
import { RepositoryManager } from './repositories/RepositoryManager';

export class DaemonLifecycle {
  constructor(
    private daemon: AgentDaemon,
    private sessionRecovery: SessionRecovery,
    private stateStore: StateStore,
    private repositoryManager: RepositoryManager
  ) {}

  public async startup(): Promise<void> {
    console.log('Daemon startup sequence initiated.');
    
    // Recover state if possible
    await this.recoverCrashState();
    
    // Start the transport layers and workers
    await this.daemon.start();
    
    console.log('Daemon startup sequence complete.');
  }

  public async shutdown(): Promise<void> {
    console.log('Daemon shutdown sequence initiated.');
    
    // Persist current state, flush metrics
    await this.persistState();
    
    // Stop transports and workers
    await this.daemon.stop();

    console.log('Daemon shutdown sequence complete.');
  }

  private async recoverCrashState(): Promise<void> {
    const state = await this.stateStore.loadState();
    if (state) {
      // Restore repositories
      for (const repo of state.repositories) {
        await this.repositoryManager.addRepository(repo.id, repo.rootPath);
      }
      this.daemon.bus.publish({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        channel: 'daemon',
        topic: 'daemon.state.restored',
        payload: { repositoryCount: state.repositories.length }
      });
    }
  }

  private async persistState(): Promise<void> {
    const repos = this.repositoryManager.listRepositories().map(r => ({
      id: r.repositoryId,
      rootPath: r.rootPath
    }));

    await this.stateStore.saveState({
      version: '1.0.0',
      repositories: repos,
      lastSavedAt: Date.now()
    });

    this.daemon.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: 'daemon',
      topic: 'daemon.state.saved',
      payload: { repositoryCount: repos.length }
    });
  }
}
