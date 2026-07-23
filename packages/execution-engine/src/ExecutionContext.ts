import { Sandbox } from "@agent-os/sandbox";
import { ContextStack } from "@agent-os/context";

export interface ExecutionContext {
  executionId: string;
  sessionId: string;
  requestId: string;
  workspaceRoot: string;
  planId: string;
  sandbox?: Sandbox;        // replaces sandboxId — stores Sandbox object directly
  startedAt: number;
  /** Live sliding-window context buffer — tracks task events for long runs */
  contextStack?: ContextStack;
  // Pipeline context passed through from RuntimePipeline stages
  goal?: string;
  repositorySnapshot?: any;
  patternSnapshot?: any;
  knowledgeUnits?: any[];
}
