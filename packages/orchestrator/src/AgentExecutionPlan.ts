import { ExecutionPlan } from "@agent-os/planner";
import { AgentResult } from "./AgentResult";

export interface AgentExecutionPlan {
  plan: ExecutionPlan;
  agentResults: AgentResult[];
  consensusSummary: string;
}
