import { Sandbox } from "@agent-os/sandbox";

export interface ExecutionContext {
  executionId: string;
  sessionId: string;
  requestId: string;
  workspaceRoot: string;
  planId: string;
  sandbox?: Sandbox;        // replaces sandboxId — stores Sandbox object directly
  startedAt: number;
  // Pipeline context passed through from RuntimePipeline stages
  goal?: string;
  repositorySnapshot?: any;
  patternSnapshot?: any;
  knowledgeUnits?: any[];
}
