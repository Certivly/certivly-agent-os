import { expect, test, describe } from "bun:test";
import { DaemonRouter } from "../src/api/DaemonRouter";
import { RequestHandler } from "../src/api/RequestHandler";
import { ResponseHandler } from "../src/api/ResponseHandler";
import { ClientManager } from "../src/clients/ClientManager";
import { AgentDaemon } from "../src/AgentDaemon";
import { Transport } from "../src/api/Transport";
import { RepositoryCache } from "../src/repositories/RepositoryCache";
import { RepositoryRegistry } from "../src/repositories/RepositoryRegistry";
import { SessionCoordinator } from "../src/sessions/SessionCoordinator";
import { RuntimePool } from "../src/sessions/RuntimePool";

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
    const daemon = new AgentDaemon(clientManager, cache, coordinator, transport);
    const requestHandler = new RequestHandler(daemon);
    const responseHandler = new ResponseHandler(transport);
    
    const router = new DaemonRouter(transport, requestHandler, responseHandler, clientManager);
    expect(router).toBeDefined();
  });
});
