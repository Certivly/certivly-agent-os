import { expect, test, describe } from "bun:test";
import { DaemonRouter } from "../src/api/DaemonRouter";
import { RequestHandler } from "../src/api/RequestHandler";
import { ResponseHandler } from "../src/api/ResponseHandler";
import { ClientManager } from "../src/clients/ClientManager";
import { AgentDaemon } from "../src/AgentDaemon";
import { Transport } from "../src/api/Transport";
import { RepositoryCache } from "../src/repositories/RepositoryCache";
import { RepositoryRegistry } from "../src/repositories/RepositoryRegistry";
import { RepositoryManager } from "../src/repositories/RepositoryManager";
import { RepositoryWatcher } from "../src/watchers/RepositoryWatcher";
import { SessionCoordinator } from "../src/sessions/SessionCoordinator";
import { RuntimePool } from "../src/sessions/RuntimePool";
import { RequestQueue } from "../src/scheduler/RequestQueue";
import { RequestScheduler } from "../src/scheduler/RequestScheduler";
import { JobQueue } from "../src/background/JobQueue";
import { JobExecutor } from "../src/background/JobExecutor";
import { BackgroundWorker } from "../src/background/BackgroundWorker";
import { DaemonMetricsService } from "../src/metrics/DaemonMetricsService";
import { EventBus } from "../src/streaming/EventBus";

class MockTransport implements Transport {
  async start() {}
  async stop() {}
  async broadcast() {}
  async send() {}
  onMessage() {}
  onConnect() {}
  onDisconnect() {}
}

describe("Transport Routing", () => {
  test("daemon router sets up transport bindings", () => {
    const transport = new MockTransport();
    const cache = new RepositoryCache(new RepositoryRegistry());
    const pool = new RuntimePool(10);
    const coordinator = new SessionCoordinator(pool, cache);
    const clientManager = new ClientManager();
    const bus = new EventBus();
    const repositoryRegistry = new RepositoryRegistry();
    const repositoryCache = new RepositoryCache(repositoryRegistry);
    const repositoryManager = new RepositoryManager(repositoryRegistry, repositoryCache, new RepositoryWatcher(bus));
    const scheduler = new RequestScheduler(new RequestQueue(), pool);
    const worker = new BackgroundWorker(new JobQueue(), new JobExecutor(bus));
    const metrics = new DaemonMetricsService(bus);
    const daemon = new AgentDaemon(clientManager, repositoryManager, coordinator, transport, scheduler, worker, metrics, bus);
    const requestHandler = new RequestHandler(daemon);
    const responseHandler = new ResponseHandler(transport);
    
    const router = new DaemonRouter(transport, requestHandler, responseHandler, clientManager);
    expect(router).toBeDefined();
  });
});
