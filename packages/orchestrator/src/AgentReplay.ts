import { AgentResult, AgentCritique, ConsensusDecision } from "./models";

export class AgentReplay {
  constructor(private eventStore: any) {}

  public async replayWorkflow(workflowId: string): Promise<any> {
    const events = await this.eventStore.query({ workflowId });
    const orderedEvents = events.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const state = {
      status: "PENDING",
      agentsRan: [] as string[],
      critiques: [] as any[],
      consensusApproved: false
    };

    for (const event of orderedEvents) {
      if (event.type === "agent.workflow.started") state.status = "RUNNING";
      else if (event.type === "agent.started") state.agentsRan.push(event.payload.role);
      else if (event.type === "agent.critique.created") state.critiques.push(event.payload);
      else if (event.type === "agent.consensus.completed") state.consensusApproved = event.payload.approved;
      else if (event.type === "agent.workflow.completed") state.status = "COMPLETED";
    }

    return state;
  }
}
