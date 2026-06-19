export interface AgentTask {
  id: string;
  type: string;
  payload: any;
  priority?: number;
}

export interface AgentResult {
  taskId: string;
  agentId: string;
  status: "success" | "failed" | "cancelled";
  data: any;
  error?: string;
  durationMs: number;
}

export interface TaskGraphNode {
  id: string;
  agent: string;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed";
  task: AgentTask;
  result?: AgentResult;
}

export interface TaskGraphEdge {
  from: string;
  to: string;
}

export interface AgentExecutionPlan {
  id: string;
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
  status: "pending" | "running" | "completed" | "failed";
}
