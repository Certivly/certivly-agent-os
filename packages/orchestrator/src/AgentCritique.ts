export interface AgentCritique {
  sourceAgent: string;
  targetAgent: string;
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
}
