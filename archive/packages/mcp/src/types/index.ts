export interface CapabilityDefinition {
  id: string;
  name: string;
  type: 'tool' | 'resource' | 'prompt';
  serverId: string;
  version: string;
  schema: unknown;
}

export type CapabilityStatus = 'DISCOVERED' | 'VALIDATED' | 'REJECTED' | 'DISABLED' | 'ACTIVE';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PolicyDecisionType = 'ALLOW' | 'ASK' | 'DENY';

export interface PolicyDecision {
  decision: PolicyDecisionType;
  reason: string;
  riskLevel: RiskLevel;
}

export interface McpServer {
  id: string;
  url: string;
  transportType: 'stdio' | 'http' | 'sse';
  status: 'connected' | 'disconnected' | 'error';
  trustLevel: 'untrusted' | 'trusted' | 'admin';
}

export interface CapabilityEntry {
  definition: CapabilityDefinition;
  status: CapabilityStatus;
  riskLevel: RiskLevel;
  policy: PolicyDecision | null;
}

export interface McpExecutionResult {
  success: boolean;
  data: any;
  error?: string;
  executionTimeMs: number;
}
