// Using any for AgentRuntime here to avoid complex imports during this phase
export class RuntimePool {
  private runtimes = new Map<string, any>(); // Map<sessionId, AgentRuntime>
  
  constructor(private maxConcurrentRuntimes: number) {}

  public acquireRuntime(sessionId: string): any {
    if (this.runtimes.has(sessionId)) {
      return this.runtimes.get(sessionId);
    }

    if (this.runtimes.size >= this.maxConcurrentRuntimes) {
      throw new Error('Runtime pool exhausted. Cannot create new runtime session.');
    }

    // In a real implementation, we would instantiate an AgentRuntime here
    // connected to the RepositoryCache.
    const runtime = { id: sessionId, execute: async (req: any) => ({ status: 'success', data: 'mock execution' }) };
    this.runtimes.set(sessionId, runtime);

    return runtime;
  }

  public releaseRuntime(sessionId: string): void {
    this.runtimes.delete(sessionId);
  }

  public getActiveSessionIds(): string[] {
    return Array.from(this.runtimes.keys());
  }
}
