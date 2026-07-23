export enum AgentRole {
  ARCHITECT = "ARCHITECT",
  CODER = "CODER",
  TESTER = "TESTER",
  REVIEWER = "REVIEWER",
  SECURITY = "SECURITY",
  DOCS = "DOCS",
  RESEARCHER = "RESEARCHER"
}

export interface AgentResult {
  agentId: string;
  role: AgentRole;
  summary: string;
  findings: string[];
  recommendations: string[];
  confidence: number;
  graphRefs: string[];
  knowledgeRefs: string[];
  eventRefs: string[];
}
