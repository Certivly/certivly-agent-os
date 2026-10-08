import { ExecutionPlan } from "@agent-os/planner";
import { KnowledgeUnit } from "@agent-os/wicer";
import { Memory } from "@agent-os/memory";
import { AgentResult } from "./AgentResult";

export interface AgentContext {
  goal: string;
  executionPlan?: ExecutionPlan;
  repositorySnapshot: any;
  memory: Memory[];
  knowledge: KnowledgeUnit[];
  previousResults: AgentResult[];
}
