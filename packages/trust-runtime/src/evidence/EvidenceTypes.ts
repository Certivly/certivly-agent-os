export interface Evidence {
  id: string;
  type: "patch" | "test" | "build" | "validation" | "repository" | "memory";
  sourceAgent: string;
  timestamp: number;
  sourceEventIds: string[];
  sourceGraphRefs: string[];
  payload: any;
}
