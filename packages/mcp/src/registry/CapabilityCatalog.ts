import { CapabilityEntry, CapabilityDefinition, RiskLevel, CapabilityStatus } from '../types';

export class CapabilityCatalog {
  private capabilities: Map<string, CapabilityEntry> = new Map();

  public add(definition: CapabilityDefinition, status: CapabilityStatus, riskLevel: RiskLevel): void {
    const key = `${definition.serverId}:${definition.id}`;
    this.capabilities.set(key, {
      definition,
      status,
      riskLevel,
      policy: null
    });
  }

  public get(serverId: string, capabilityId: string): CapabilityEntry | undefined {
    const key = `${serverId}:${capabilityId}`;
    return this.capabilities.get(key);
  }

  public list(): CapabilityEntry[] {
    return Array.from(this.capabilities.values());
  }

  public updateStatus(serverId: string, capabilityId: string, status: CapabilityStatus): void {
    const entry = this.get(serverId, capabilityId);
    if (entry) {
      entry.status = status;
    }
  }

  public updatePolicy(serverId: string, capabilityId: string, policy: any): void {
    const entry = this.get(serverId, capabilityId);
    if (entry) {
      entry.policy = policy;
    }
  }
}
