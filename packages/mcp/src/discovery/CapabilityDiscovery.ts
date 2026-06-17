import { CapabilityDefinition, McpServer } from '../types';
import { McpTransport } from '../transports/McpTransport';
import { EventStore } from '@agent-os/events';
import { McpEvents } from '../events/event-types';

export class CapabilityDiscovery {
  constructor(private eventStore: EventStore) {}

  public async discover(server: McpServer, transport: McpTransport): Promise<CapabilityDefinition[]> {
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: McpEvents.DISCOVERY_STARTED,
      timestamp: new Date().toISOString(),
      sessionId: 'mcp-system',
      requestId: 'mcp-system',
      source: 'mcp.discovery',
      payload: { serverId: server.id },
      version: 1
    });

    try {
      // Mock discovery payload
      const response = await transport.send({ method: 'list_capabilities' }) as any;
      
      const capabilities: CapabilityDefinition[] = (response?.result?.capabilities || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        serverId: server.id,
        version: c.version || '1.0.0',
        schema: c.schema || {}
      }));

      for (const cap of capabilities) {
        this.eventStore.append({
          id: crypto.randomUUID(),
          eventType: McpEvents.CAPABILITY_DISCOVERED,
          timestamp: new Date().toISOString(),
          sessionId: 'mcp-system',
          requestId: 'mcp-system',
          source: 'mcp.discovery',
          payload: { serverId: server.id, capabilityId: cap.id, type: cap.type },
          version: 1
        });
      }

      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: McpEvents.DISCOVERY_COMPLETED,
        timestamp: new Date().toISOString(),
        sessionId: 'mcp-system',
        requestId: 'mcp-system',
        source: 'mcp.discovery',
        payload: { serverId: server.id, discoveredCount: capabilities.length },
        version: 1
      });

      return capabilities;
    } catch (e) {
      // Log error, but don't crash
      return [];
    }
  }
}
