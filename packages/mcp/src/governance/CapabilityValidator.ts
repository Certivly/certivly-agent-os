import { CapabilityDefinition } from '../types';
import { EventStore } from '@agent-os/events';
import { McpEvents } from '../events/event-types';

export class CapabilityValidator {
  constructor(private eventStore: EventStore) {}

  public validate(def: CapabilityDefinition): boolean {
    const isValid = !!(def.id && def.name && def.type && def.serverId && def.version);

    if (isValid) {
      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: McpEvents.CAPABILITY_VALIDATED,
        timestamp: new Date().toISOString(),
        sessionId: 'mcp-system',
        requestId: 'mcp-system',
        source: 'mcp.governance',
        payload: { capabilityId: def.id, serverId: def.serverId },
        version: 1
      });
      return true;
    } else {
      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: McpEvents.CAPABILITY_REJECTED,
        timestamp: new Date().toISOString(),
        sessionId: 'mcp-system',
        requestId: 'mcp-system',
        source: 'mcp.governance',
        payload: { capabilityId: def.id || 'unknown', serverId: def.serverId || 'unknown', reason: 'Malformed schema' },
        version: 1
      });
      return false;
    }
  }

  public assignRiskLevel(def: CapabilityDefinition): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // Basic heuristic: 'tool' types modifying things are HIGH/CRITICAL.
    if (def.type === 'tool' && def.name) {
      const n = def.name.toLowerCase();
      if (n.includes('shell') || n.includes('exec') || n.includes('cmd')) return 'CRITICAL';
      if (n.includes('write') || n.includes('delete') || n.includes('update')) return 'HIGH';
      return 'MEDIUM';
    }
    return 'LOW';
  }
}
