import { metrics } from '@agent-os/metrics';

export const McpMetrics = {
  serversRegistered: metrics.counter('mcp_servers_registered'),
  capabilitiesDiscovered: metrics.counter('mcp_capabilities_discovered'),
  capabilitiesActive: metrics.counter('mcp_capabilities_active'),
  executionsTotal: metrics.counter('mcp_executions_total'),
  executionFailures: metrics.counter('mcp_execution_failures'),
  policyDenials: metrics.counter('mcp_policy_denials'),
  // Average duration isn't cleanly a counter, but assuming Phase 2.1 provides gauge/histogram
  // We'll use a standard counter for sums for now to stick to existing patterns
  executionDurationSum: metrics.counter('mcp_avg_execution_duration')
};
