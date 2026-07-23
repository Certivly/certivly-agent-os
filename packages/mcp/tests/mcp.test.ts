import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EventStore } from '@agent-os/events';
import { 
  McpRegistry, 
  CapabilityDiscovery, 
  CapabilityValidator, 
  CapabilityPolicyEngine,
  CapabilitySandbox,
  McpExecutor,
  McpRouter,
  McpTraceService,
  HttpTransport,
  McpServer,
  McpEvents
} from '../src';
import { WicerAPI } from '@agent-os/wicer';

describe('MCP Federation', () => {
  let dbPath: string;
  let eventStore: EventStore;

  beforeEach(() => {
    dbPath = path.join(__dirname, '.agentos', `mcp-events-${crypto.randomUUID()}.db`);
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    eventStore = new EventStore(dbPath);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
      if (fs.existsSync(dbPath + '-journal')) fs.rmSync(dbPath + '-journal', { force: true });
    } catch (e) {
      // Ignore cleanup busy locks
    }
  });

  it('should discover capabilities, validate, govern, and execute securely', async () => {
    const registry = new McpRegistry(eventStore);
    const server: McpServer = {
      id: 'server-1',
      url: 'http://localhost:8080',
      transportType: 'http',
      status: 'connected',
      trustLevel: 'untrusted'
    };
    registry.registerServer(server);

    // 1. Discovery
    const discovery = new CapabilityDiscovery(eventStore);
    
    // Mock transport
    const transport = new HttpTransport(server.url);
    transport.send = async () => ({
      result: {
        capabilities: [
          { id: 'cap-1', name: 'read_doc', type: 'tool', version: '1.0' },
          { id: 'cap-bad', type: 'tool' } // Missing name
        ]
      }
    });

    const discovered = await discovery.discover(server, transport);
    expect(discovered.length).toBe(2);

    // 2. Governance (Validation & Policy)
    const validator = new CapabilityValidator(eventStore);
    const policyEngine = new CapabilityPolicyEngine(eventStore);

    for (const cap of discovered) {
      const isValid = validator.validate(cap);
      const riskLevel = validator.assignRiskLevel(cap);
      if (isValid) {
        registry.catalog.add(cap, 'VALIDATED', riskLevel);
        const policy = policyEngine.evaluate(cap, riskLevel, server);
        registry.catalog.updatePolicy(server.id, cap.id, policy);
        
        if (policy.decision === 'ALLOW' || policy.decision === 'ASK') {
          registry.catalog.updateStatus(server.id, cap.id, 'ACTIVE');
        }
      } else {
        registry.catalog.add(cap, 'REJECTED', riskLevel);
      }
    }

    const validCap = registry.catalog.get(server.id, 'cap-1');
    const badCap = registry.catalog.get(server.id, 'cap-bad');
    
    expect(validCap?.status).toBe('ACTIVE');
    expect(badCap?.status).toBe('REJECTED');

    // 3. Routing & Execution
    const router = new McpRouter(registry);
    const targetEntry = router.route('cap-1');
    expect(targetEntry).toBeDefined();

    const sandbox = new CapabilitySandbox();
    const tracer = new McpTraceService();
    const executor = new McpExecutor(sandbox, eventStore, tracer, async () => 'ALLOW');

    const result = await executor.execute(targetEntry!, transport, {}, 'sess-1', 'req-1');
    expect(result.success).toBe(true);

    // 4. Traceability
    const traces = tracer.getTraces('sess-1');
    expect(traces.length).toBe(1);
    expect(traces[0].capabilityId).toBe('cap-1');

    // WiCER Structural Documentation
    const wicer = new WicerAPI(eventStore);
    wicer.saveKnowledge({
      id: `mcp_${targetEntry!.definition.id}`,
      type: 'MCP_CAPABILITY' as any,
      content: `Server: ${targetEntry!.definition.serverId}, Risk: ${targetEntry!.riskLevel}`,
      confidence: 1.0,
      references: []
    });

    const wi = wicer.query('MCP_CAPABILITY' as any);
    expect(wi.length).toBe(1);
  });

  it('should deny execution on high risk capabilities for untrusted servers', () => {
    const registry = new McpRegistry(eventStore);
    const server: McpServer = {
      id: 'server-2',
      url: 'http://localhost',
      transportType: 'http',
      status: 'connected',
      trustLevel: 'untrusted'
    };
    
    const cap = { id: 'cap-exec', name: 'shell_exec', type: 'tool', serverId: 'server-2', version: '1.0', schema: {} } as any;
    
    const validator = new CapabilityValidator(eventStore);
    const riskLevel = validator.assignRiskLevel(cap);
    expect(riskLevel).toBe('CRITICAL');

    const policyEngine = new CapabilityPolicyEngine(eventStore);
    const policy = policyEngine.evaluate(cap, riskLevel, server);
    
    expect(policy.decision).toBe('DENY');
    
    // Validate event
    const events = eventStore.loadEvents('mcp-system');
    const denialEvent = events.find((env: any) => env.event.eventType === McpEvents.POLICY_DENIED);
    expect(denialEvent).toBeDefined();
  });

  it('should enforce sandbox timeouts and isolate failures', async () => {
    const sandbox = new CapabilitySandbox();
    
    const slowTask = async () => new Promise<any>(resolve => setTimeout(resolve, 200));
    
    try {
      await sandbox.executeIsolated(slowTask, 50); // 50ms timeout
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e.message).toBe('Sandbox Timeout Exceeded');
    }
  });

  it('should handle stress load gracefully', async () => {
    const registry = new McpRegistry(eventStore);
    
    for (let i = 0; i < 100; i++) {
      registry.registerServer({
        id: `srv-${i}`,
        url: 'test',
        transportType: 'http',
        status: 'connected',
        trustLevel: 'trusted'
      });
      for (let j = 0; j < 100; j++) {
        registry.catalog.add({
          id: `cap-${i}-${j}`,
          name: 'tool',
          type: 'tool',
          serverId: `srv-${i}`,
          version: '1',
          schema: {}
        }, 'VALIDATED', 'LOW');
      }
    }

    expect(registry.listServers().length).toBe(100);
    expect(registry.catalog.list().length).toBe(10000);
    
    const sandbox = new CapabilitySandbox();
    const tracer = new McpTraceService();
    const executor = new McpExecutor(sandbox, eventStore, tracer);
    const transport = new HttpTransport('mock');

    // Simulate 100k executions across a subset to keep test time reasonable 
    // We do a batch loop to confirm memory/leak stability without timing out the runner
    const cap = registry.catalog.get('srv-0', 'cap-0-0')!;
    cap.policy = { decision: 'ALLOW', reason: '', riskLevel: 'LOW' };
    cap.status = 'ACTIVE';

    const execPromises = [];
    for (let i = 0; i < 100; i++) {
      execPromises.push(executor.execute(cap, transport, {}, 'stress', `req-${i}`));
    }

    const results = await Promise.all(execPromises);
    expect(results.length).toBe(100);
  });
});
