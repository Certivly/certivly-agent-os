import { ClientManager } from './clients/ClientManager';
import { ClientConnection } from './clients/ClientSession';
import { SessionCoordinator, SessionState } from './sessions/SessionCoordinator';
import { Transport } from './api/Transport';
import { RepositoryManager } from './repositories/RepositoryManager';
import { RepositoryWorkspace } from './repositories/RepositoryWorkspace';
import { RequestScheduler } from './scheduler/RequestScheduler';
import { BackgroundWorker } from './background/BackgroundWorker';
import { DaemonMetricsService } from './metrics/DaemonMetricsService';
import { EventBus } from './streaming/EventBus';

export class AgentDaemon {
  constructor(
    private clientManager: ClientManager,
    private repositoryManager: RepositoryManager,
    private sessionCoordinator: SessionCoordinator,
    private transport: Transport,
    private scheduler: RequestScheduler,
    private worker: BackgroundWorker,
    public readonly metrics: DaemonMetricsService,
    public readonly bus: EventBus
  ) {}

  public async start(): Promise<void> {
    await this.transport.start();
    this.worker.start();
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: 'daemon',
      topic: 'daemon.started',
      payload: { version: '1.0.0', pid: process.pid }
    });
  }

  public async stop(): Promise<void> {
    this.worker.stop();
    await this.transport.stop();
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: 'daemon',
      topic: 'daemon.stopped',
      payload: {}
    });
  }

  public async registerClient(client: ClientConnection): Promise<void> {
    await this.clientManager.registerClient(client);
    this.metrics.increment('daemon_clients');
  }

  public async unregisterClient(clientId: string): Promise<void> {
    await this.clientManager.unregisterClient(clientId);
  }

  public async createSession(clientId: string, repositoryId: string, rootPath: string): Promise<string> {
    const sessionId = await this.sessionCoordinator.createSession(clientId, repositoryId, rootPath);
    this.metrics.increment('daemon_sessions');
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: `session:${sessionId}`,
      topic: 'session.created',
      payload: { sessionId, clientId, repositoryId }
    });
    return sessionId;
  }

  public async endSession(sessionId: string): Promise<void> {
    this.sessionCoordinator.endSession(sessionId);
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: `session:${sessionId}`,
      topic: 'session.ended',
      payload: { sessionId }
    });
  }

  public getActiveSessions(): string[] {
    return this.sessionCoordinator.getActiveSessions();
  }

  public async getRepository(repositoryId: string, rootPath: string = process.cwd()): Promise<RepositoryWorkspace> {
    return await this.repositoryManager.addRepository(repositoryId, rootPath);
  }

  public listRepositories(): RepositoryWorkspace[] {
    return this.repositoryManager.listRepositories();
  }

  public async getSession(sessionId: string): Promise<SessionState> {
    const session = this.sessionCoordinator.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return session;
  }

  public async execute(request: any): Promise<any> {
    this.metrics.increment('daemon_requests');
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: `session:${request.payload?.sessionId ?? 'default'}`,
      topic: 'session.execution.started',
      payload: { requestId: request.id }
    });
    const result = await this.scheduler.schedule(request);
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: `session:${request.payload?.sessionId ?? 'default'}`,
      topic: 'session.execution.completed',
      payload: { requestId: request.id, success: !result?.error }
    });
    return result;
  }
}
