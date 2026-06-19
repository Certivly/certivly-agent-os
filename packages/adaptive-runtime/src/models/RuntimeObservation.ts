export interface RuntimeObservation {
  type: string;
  source: string;
  details: any;
}

export interface PlanRevision {
  id: string;
  originalNodes: string[];
  addedNodes: string[];
  reason: string;
}

export interface ExecutionCycle {
  cycleNumber: number;
  observations: RuntimeObservation[];
  revisions: PlanRevision[];
  completedTasks: string[];
}
