export * from "./AgentContext";
export * from "./AgentResult";
export * from "./AgentCritique";
export * from "./AgentExecutionPlan";

export interface ConsensusDecision {
  approved: boolean;
  concerns: string[];
  recommendations: string[];
  confidence: number;
}

export interface Agent {
  id: string;
  name: string;
  role: import("./AgentResult").AgentRole;
  version: string;
  execute(context: import("./AgentContext").AgentContext): Promise<import("./AgentResult").AgentResult>;
}
