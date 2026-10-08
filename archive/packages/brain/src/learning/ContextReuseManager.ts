/** Avoids rebuilding identical contexts within a session. Moved from @agent-os/seol. */
export class ContextReuseManager {
  private lastContextHash: string | null = null;
  private lastContext: any = null;

  public reuseOrBuild(currentHash: string, builder: () => any): any {
    if (this.lastContextHash === currentHash && this.lastContext) {
      return this.lastContext;
    }
    const newContext = builder();
    this.lastContext = newContext;
    this.lastContextHash = currentHash;
    return newContext;
  }
}
