export interface McpTraceRecord {
  requestId: string;
  sessionId: string;
  serverId: string;
  capabilityId: string;
  capabilityVersion: string;
  policyDecision: string;
  executionTimeMs: number;
}

export class McpTraceService {
  private traces: McpTraceRecord[] = [];

  public recordExecution(record: McpTraceRecord): void {
    this.traces.push(record);
  }

  public getTraces(sessionId: string): McpTraceRecord[] {
    return this.traces.filter(t => t.sessionId === sessionId);
  }
}
