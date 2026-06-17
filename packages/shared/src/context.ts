import { AsyncLocalStorage } from 'async_hooks';

export interface AgentContextData {
  requestId: string;
  sessionId: string;
}

export const agentContext = new AsyncLocalStorage<AgentContextData>();

export function getAgentContext(): AgentContextData | undefined {
  return agentContext.getStore();
}

export function runWithContext<T>(context: AgentContextData, fn: () => T): T {
  return agentContext.run(context, fn);
}
