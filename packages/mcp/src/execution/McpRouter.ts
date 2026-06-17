import { McpRegistry } from '../registry/McpRegistry';
import { CapabilityEntry } from '../types';

export class McpRouter {
  constructor(private registry: McpRegistry) {}

  public route(capabilityId: string): CapabilityEntry | null {
    // Simple deterministic router: First matching active capability globally
    // In a real multi-server scenario, this might need explicit server target
    const entries = this.registry.catalog.list();
    for (const entry of entries) {
      if (entry.definition.id === capabilityId && (entry.status === 'VALIDATED' || entry.status === 'ACTIVE')) {
        return entry;
      }
    }
    return null;
  }
}
