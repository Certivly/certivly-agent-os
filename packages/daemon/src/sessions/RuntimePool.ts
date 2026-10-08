export interface RuntimePipeline {
  execute: (sessionId: string, input: string) => Promise<any>;
}

/**
 * RuntimePool manages one RuntimePipeline per session.
 * Sessions are isolated: each has its own pipeline context.
 */
export class RuntimePool {
  private pipelines = new Map<string, RuntimePipeline>();

  constructor(
    private maxConcurrentRuntimes: number,
    private pipelineFactory: () => any = () => ({
      execute: async (_sessionId: string, input: string) => ({ status: 'success', input })
    })
  ) {}

  public acquireRuntime(sessionId: string): { id: string; execute: (req: any) => Promise<any> } {
    if (!this.pipelines.has(sessionId)) {
      if (this.pipelines.size >= this.maxConcurrentRuntimes) {
        throw new Error(
          `Runtime pool exhausted (max ${this.maxConcurrentRuntimes}). Cannot create session ${sessionId}.`
        );
      }
      this.pipelines.set(sessionId, this.pipelineFactory());
    }

    const pipeline = this.pipelines.get(sessionId)!;

    return {
      id: sessionId,
      execute: async (req: any) => {
        // req.input is the natural language goal
        const input: string = req.input ?? req.goal ?? req.query ?? JSON.stringify(req);
        return await pipeline.execute(sessionId, input);
      }
    };
  }

  public releaseRuntime(sessionId: string): void {
    this.pipelines.delete(sessionId);
  }

  public getActiveSessionIds(): string[] {
    return Array.from(this.pipelines.keys());
  }
}
