export class WorkspaceConsistencyValidator {
  public validate(graphVersion: number, wikiVersion: number, brainVersion: number, memoryVersion: number): boolean {
    if (graphVersion !== wikiVersion) return false;
    if (wikiVersion !== brainVersion) return false;
    if (brainVersion !== memoryVersion) return false;
    return true;
  }

  public assertConsistency(graphVersion: number, wikiVersion: number, brainVersion: number, memoryVersion: number): void {
    if (!this.validate(graphVersion, wikiVersion, brainVersion, memoryVersion)) {
      throw new Error(`Workspace Inconsistency Detected! Graph: ${graphVersion}, WiCER: ${wikiVersion}, Brain: ${brainVersion}, Memory: ${memoryVersion}`);
    }
  }
}
