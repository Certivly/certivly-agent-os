import { PolicyDecision, CapabilityDefinition, RiskLevel, McpServer } from '../types';
import { McpMetrics } from '../metrics/metrics';
import { EventStore } from '@agent-os/events';
import { McpEvents } from '../events/event-types';

export class CapabilityPolicyEngine {
  constructor(private eventStore: EventStore) {}

  public evaluate(def: CapabilityDefinition, riskLevel: RiskLevel, server: McpServer): PolicyDecision {
    let decision: 'ALLOW' | 'ASK' | 'DENY' = 'ASK';

    if (server.trustLevel === 'untrusted') {
      if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') decision = 'DENY';
      else decision = 'ASK';
    } else if (server.trustLevel === 'trusted') {
      if (riskLevel === 'CRITICAL') decision = 'ASK';
      else decision = 'ALLOW';
    } else if (server.trustLevel === 'admin') {
      decision = 'ALLOW';
    }

    const policy = { decision, reason: `Server trust: ${server.trustLevel}, Risk: ${riskLevel}`, riskLevel };

    if (decision === 'DENY') {
      McpMetrics.policyDenials.inc();
      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: McpEvents.POLICY_DENIED,
        timestamp: new Date().toISOString(),
        sessionId: 'mcp-system',
        requestId: 'mcp-system',
        source: 'mcp.governance',
        payload: { capabilityId: def.id, serverId: def.serverId, reason: policy.reason },
        version: 1
      });
    }

    return policy;
  }
}
