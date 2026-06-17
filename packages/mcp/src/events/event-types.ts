export const McpEvents = {
  SERVER_REGISTERED: 'mcp.server.registered',
  SERVER_DISCONNECTED: 'mcp.server.disconnected',
  DISCOVERY_STARTED: 'mcp.discovery.started',
  DISCOVERY_COMPLETED: 'mcp.discovery.completed',
  CAPABILITY_DISCOVERED: 'mcp.capability.discovered',
  CAPABILITY_VALIDATED: 'mcp.capability.validated',
  CAPABILITY_REJECTED: 'mcp.capability.rejected',
  EXECUTION_STARTED: 'mcp.execution.started',
  EXECUTION_COMPLETED: 'mcp.execution.completed',
  EXECUTION_FAILED: 'mcp.execution.failed',
  POLICY_DENIED: 'mcp.policy.denied'
} as const;
