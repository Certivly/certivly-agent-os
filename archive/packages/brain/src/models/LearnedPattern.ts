export interface LearnedPattern {
  id: string;
  category: "success" | "failure" | "workflow" | "architecture";
  description: string;
  occurrences: number;
  confidence: number;
  evidenceIds: string[];
}
