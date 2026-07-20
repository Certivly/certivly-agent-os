export interface SuccessCriterion {
  id: string;
  description: string;
  type: "test" | "validation" | "build" | "custom";
  satisfied: boolean;
}

export interface Goal {
  id: string;
  description: string;
  successCriteria: SuccessCriterion[];
  status: "pending" | "running" | "completed" | "failed";
}
