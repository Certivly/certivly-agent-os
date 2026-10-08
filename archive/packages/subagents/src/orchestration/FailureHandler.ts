export enum FailurePolicy {
  FAIL_FAST = "FAIL_FAST",
  RETRY = "RETRY",
  CONTINUE = "CONTINUE"
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export class FailureHandler {
  constructor(
    public policy: FailurePolicy = FailurePolicy.FAIL_FAST,
    public retryPolicy: RetryPolicy = { maxAttempts: 3, backoffMs: 500 }
  ) {}

  public async handleFailure(nodeId: string, error: any, attempt: number): Promise<boolean> {
    if (this.policy === FailurePolicy.RETRY && attempt < this.retryPolicy.maxAttempts) {
      await new Promise(r => setTimeout(r, this.retryPolicy.backoffMs * attempt));
      return true; // Should retry
    }
    
    if (this.policy === FailurePolicy.CONTINUE) {
      return false; // Don't retry, but don't fail the graph
    }

    return false; // Fail fast
  }
}
