export class AgentCancellation {
  private cancelled = false;

  public cancel() {
    this.cancelled = true;
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  public throwIfCancelled() {
    if (this.cancelled) {
      throw new Error("Agent execution was cancelled");
    }
  }
}
