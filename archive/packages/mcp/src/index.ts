/**
 * ARCHIVED PACKAGE: @agent-os/mcp
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Not yet exposed on primary tool pipeline
 *
 * Revival condition: External MCP tool benchmark showing improved task completion
 *
 * To revive: move this directory back to packages/mcp/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

export * from './types';
export * from './events/event-types';
export * from './metrics/metrics';
export * from './transports/McpTransport';
export * from './transports/StdioTransport';
export * from './transports/HttpTransport';
export * from './transports/SseTransport';
export * from './discovery/CapabilityDiscovery';
export * from './registry/CapabilityCatalog';
export * from './registry/McpRegistry';
export { McpRegistry as McpClientRegistry } from './registry/McpRegistry';
export * from './governance/CapabilityValidator';
export * from './governance/CapabilityPolicyEngine';
export * from './sandbox/CapabilitySandbox';
export * from './execution/McpExecutor';
export * from './execution/McpRouter';
export * from './tracing/McpTraceService';
