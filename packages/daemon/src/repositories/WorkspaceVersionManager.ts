export type WorkspaceVersion = {
  graphVersion: number;
  wikiVersion: number;
  brainVersion: number;
  memoryVersion: number;
};

export class WorkspaceVersionManager {
  private version: WorkspaceVersion = {
    graphVersion: 0,
    wikiVersion: 0,
    brainVersion: 0,
    memoryVersion: 0
  };

  public commitUpdate(): void {
    const next = this.version.graphVersion + 1;
    this.version = {
      graphVersion: next,
      wikiVersion: next,
      brainVersion: next,
      memoryVersion: next
    };
  }

  public getVersion(): WorkspaceVersion {
    return { ...this.version };
  }

  public validateSync(): boolean {
    const v = this.version.graphVersion;
    return (
      this.version.wikiVersion === v &&
      this.version.brainVersion === v &&
      this.version.memoryVersion === v
    );
  }
}
