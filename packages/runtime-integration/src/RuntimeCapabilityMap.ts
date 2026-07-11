export enum Capability {
  REPOSITORY_ANALYSIS = "REPOSITORY_ANALYSIS",
  PATTERN_DETECTION = "PATTERN_DETECTION",
  PLANNING = "PLANNING",
  ORCHESTRATION = "ORCHESTRATION",
  EXECUTION = "EXECUTION",
  PATCH_GENERATION = "PATCH_GENERATION",
  TRUST_ANALYSIS = "TRUST_ANALYSIS",
  MEMORY_RETRIEVAL = "MEMORY_RETRIEVAL"
}

export class RuntimeCapabilityMap {
  private capabilities = new Set<Capability>();

  public registerCapability(cap: Capability) {
    this.capabilities.add(cap);
  }

  public getCapabilities(): Capability[] {
    return Array.from(this.capabilities);
  }
}
