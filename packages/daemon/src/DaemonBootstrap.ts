import { AgentDaemon } from './AgentDaemon';
import { ClientManager } from './clients/ClientManager';
import { RepositoryRegistry } from './repositories/RepositoryRegistry';
import { RepositoryCache } from './repositories/RepositoryCache';
import { RuntimePool } from './sessions/RuntimePool';
import { SessionCoordinator } from './sessions/SessionCoordinator';
import { DaemonConfig } from './DaemonConfig';
import { RequestHandler } from './api/RequestHandler';
import { ResponseHandler } from './api/ResponseHandler';
import { DaemonRouter } from './api/DaemonRouter';
import { UnixSocketTransport } from './api/UnixSocketTransport';
import { TcpTransport } from './api/TcpTransport';
import { Transport } from './api/Transport';
import { EventBus } from './streaming/EventBus';
import { StreamManager } from './streaming/StreamManager';
import { RepositoryWatcher } from './watchers/RepositoryWatcher';
import { RepositoryManager } from './repositories/RepositoryManager';
import { RequestQueue } from './scheduler/RequestQueue';
import { RequestScheduler } from './scheduler/RequestScheduler';
import { JobQueue } from './background/JobQueue';
import { JobExecutor } from './background/JobExecutor';
import { BackgroundWorker } from './background/BackgroundWorker';
import { DaemonMetricsService } from './metrics/DaemonMetricsService';
import { StateStore } from './persistence/StateStore';
import { SessionSnapshotStore } from './persistence/SessionSnapshotStore';
import { SessionRecovery } from './sessions/SessionRecovery';
import { DaemonLifecycle } from './DaemonLifecycle';
import { IncrementalUpdatePipeline } from './watchers/IncrementalUpdatePipeline';

export class DaemonBootstrap {
  public static create(config: DaemonConfig, customTransport?: Transport): { daemon: AgentDaemon; lifecycle: DaemonLifecycle } {
    const bus = new EventBus();
    const metrics = new DaemonMetricsService(bus);

    // Transport: prefer Unix socket, fall back to TCP, or use custom
    let transport: Transport;
    if (customTransport) {
      transport = customTransport;
    } else if (config.socketPath) {
      transport = new UnixSocketTransport(config.socketPath);
    } else if (config.tcpPort) {
      transport = new TcpTransport(config.tcpPort);
    } else {
      throw new Error('DaemonConfig must specify socketPath or tcpPort');
    }

    // Repositories
    const repositoryRegistry = new RepositoryRegistry();
    const repositoryCache = new RepositoryCache(repositoryRegistry);
    const repositoryWatcher = new RepositoryWatcher(bus);
    const updatePipeline = new IncrementalUpdatePipeline(repositoryCache, bus);
    const repositoryManager = new RepositoryManager(repositoryRegistry, repositoryCache, repositoryWatcher);

    // RuntimePool backed by real AgentRuntime instances
    const runtimePool = new RuntimePool(
      config.maxConcurrentRuntimes,
      () => {
        let runtimeInstance: any = null;
        return {
          execute: async (sessionId: string, input: string) => {
            if (!runtimeInstance) {
              const { AgentRuntime } = await import('@agent-os/agent-runtime');
              runtimeInstance = new AgentRuntime({ configPath: '' }, sessionId);
            }
            return await runtimeInstance.handleRequest(sessionId, input);
          }
        };
      }
    );

    // Sessions & Scheduling
    const sessionCoordinator = new SessionCoordinator(runtimePool, repositoryCache);
    const requestQueue = new RequestQueue();
    const requestScheduler = new RequestScheduler(requestQueue, runtimePool);

    // Background jobs
    const jobQueue = new JobQueue();
    const jobExecutor = new JobExecutor(bus);
    const backgroundWorker = new BackgroundWorker(jobQueue, jobExecutor);

    // Persistence
    const stateStore = new StateStore(config.dataDir);
    const snapshotStore = new SessionSnapshotStore(config.dataDir);
    const sessionRecovery = new SessionRecovery(sessionCoordinator);

    // Clients & API
    const clientManager = new ClientManager();
    const streamManager = new StreamManager(bus, transport);

    const daemon = new AgentDaemon(
      clientManager,
      repositoryManager,
      sessionCoordinator,
      transport,
      requestScheduler,
      backgroundWorker,
      metrics,
      bus
    );

    const requestHandler = new RequestHandler(daemon);
    const responseHandler = new ResponseHandler(transport);
    new DaemonRouter(transport, requestHandler, responseHandler, clientManager);

    const lifecycle = new DaemonLifecycle(daemon, sessionRecovery, stateStore, repositoryManager);

    return { daemon, lifecycle };
  }
}
