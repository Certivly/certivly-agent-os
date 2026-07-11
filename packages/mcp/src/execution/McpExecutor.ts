import { CapabilityEntry, McpExecutionResult } from '../types';
import { McpTransport } from '../transports/McpTransport';
import { CapabilitySandbox } from '../sandbox/CapabilitySandbox';
import { EventStore } from '@agent-os/events';
import { McpEvents } from '../events/event-types';
import { McpMetrics } from '../metrics/metrics';
import { McpTraceService } from '../tracing/McpTraceService';
import { AgentError } from '@agent-os/shared';

export type InterceptorDecision = "ALLOW" | "DENY";
export type GovernanceInterceptor = (entry: CapabilityEntry) => Promise<InterceptorDecision>;

export class McpExecutor {
  constructor(
    private sandbox: CapabilitySandbox,
    private eventStore: EventStore,
    private tracer: McpTraceService,
    private governanceInterceptor?: GovernanceInterceptor
  ) {}

  public async execute(
    entry: CapabilityEntry,
    transport: McpTransport,
    input: any,
    sessionId: string,
    requestId: string
  ): Promise<McpExecutionResult> {
    if (entry.policy?.decision === 'DENY') {
      throw new AgentError(`Execution denied by policy: ${entry.policy.reason}`);
    }
    
    if (entry.policy?.decision === 'ASK') {
      if (this.governanceInterceptor) {
        const decision = await this.governanceInterceptor(entry);
        if (decision === 'DENY') {
          throw new AgentError(`Execution denied by user prompt.`);
        }
      } else {
        throw new AgentError(`Execution requires user permission (ASK policy), but no interceptor is wired.`);
      }
    }

    if (entry.status !== 'ACTIVE' && entry.status !== 'VALIDATED') {
      throw new AgentError(`Capability is not active. Status: ${entry.status}`);
    }

    const startMs = Date.now();
    McpMetrics.executionsTotal.inc();

    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: McpEvents.EXECUTION_STARTED,
      timestamp: new Date().toISOString(),
      sessionId,
      requestId,
      source: 'mcp.executor',
      payload: { capabilityId: entry.definition.id, serverId: entry.definition.serverId },
      version: 1
    });

    try {
      // Isolate via Sandbox
      const response = await this.sandbox.executeIsolated(async () => {
        return transport.send({ method: entry.definition.name, params: input });
      }, 5000); // 5s timeout

      const duration = Date.now() - startMs;
      // Tracing
      this.tracer.recordExecution({
        requestId,
        sessionId,
        serverId: entry.definition.serverId,
        capabilityId: entry.definition.id,
        capabilityVersion: entry.definition.version,
        policyDecision: entry.policy?.decision || 'ALLOW',
        executionTimeMs: duration
      });

      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: McpEvents.EXECUTION_COMPLETED,
        timestamp: new Date().toISOString(),
        sessionId,
        requestId,
        source: 'mcp.executor',
        payload: { capabilityId: entry.definition.id, serverId: entry.definition.serverId, durationMs: duration },
        version: 1
      });

      return { success: true, data: response, executionTimeMs: duration };
    } catch (e: any) {
      const duration = Date.now() - startMs;
      McpMetrics.executionFailures.inc();

      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: McpEvents.EXECUTION_FAILED,
        timestamp: new Date().toISOString(),
        sessionId,
        requestId,
        source: 'mcp.executor',
        payload: { capabilityId: entry.definition.id, serverId: entry.definition.serverId, reason: e.message },
        version: 1
      });

      return { success: false, data: null, error: e.message, executionTimeMs: duration };
    }
  }
}
