export type ConventionType = 
  | "naming" 
  | "imports" 
  | "folders" 
  | "testing" 
  | "architecture" 
  | "files";

export interface Convention {
  id: string;
  type: ConventionType;
  pattern: string;
  confidence: number;
  evidenceCount: number;
  evidence: string[]; // Paths or context showing this convention
}
