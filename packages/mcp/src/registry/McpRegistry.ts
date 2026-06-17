import { McpServer } from '../types';
import { EventStore } from '@agent-os/events';
import { McpEvents } from '../events/event-types';
import { CapabilityCatalog } from './CapabilityCatalog';

export class McpRegistry {
  private servers: Map<string, McpServer> = new Map();
  public catalog: CapabilityCatalog = new CapabilityCatalog();

  constructor(private eventStore: EventStore) {}

  public registerServer(server: McpServer): void {
    this.servers.set(server.id, server);
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: McpEvents.SERVER_REGISTERED,
      timestamp: new Date().toISOString(),
      sessionId: 'mcp-system',
      requestId: 'mcp-system',
      source: 'mcp.registry',
      payload: { serverId: server.id, url: server.url, trustLevel: server.trustLevel },
      version: 1
    });
  }

  public removeServer(serverId: string): void {
    this.servers.delete(serverId);
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: McpEvents.SERVER_DISCONNECTED,
      timestamp: new Date().toISOString(),
      sessionId: 'mcp-system',
      requestId: 'mcp-system',
      source: 'mcp.registry',
      payload: { serverId },
      version: 1
    });
  }

  public getServer(serverId: string): McpServer | undefined {
    return this.servers.get(serverId);
  }

  public listServers(): McpServer[] {
    return Array.from(this.servers.values());
  }
}
