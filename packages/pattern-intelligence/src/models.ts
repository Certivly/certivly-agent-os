export enum PatternType {
  FOLDER_STRUCTURE = "FOLDER_STRUCTURE",
  SERVICE_LAYER = "SERVICE_LAYER",
  REPOSITORY_LAYER = "REPOSITORY_LAYER",
  API_LAYER = "API_LAYER",
  VALIDATION_LAYER = "VALIDATION_LAYER",
  TEST_LAYER = "TEST_LAYER",
  ERROR_HANDLING = "ERROR_HANDLING",
  CONFIGURATION = "CONFIGURATION",
  DEPENDENCY_USAGE = "DEPENDENCY_USAGE",
  NAMING_CONVENTION = "NAMING_CONVENTION",
  ARCHITECTURAL_STYLE = "ARCHITECTURAL_STYLE"
}

export interface PatternEvidence {
  graphRefs: string[];
  fileRefs: string[];
  symbolRefs: string[];
  knowledgeRefs: string[];
  confidenceContribution: number;
}

export interface Pattern {
  id: string;
  type: PatternType;
  title: string;
  description: string;
  confidence: number;
  occurrences: number;
  evidence: PatternEvidence[];
  createdAt: string;
  version: number;
}

export interface PatternSnapshot {
  generatedAt: string;
  repositoryVersion: string;
  patterns: Pattern[];
}

export interface PatternDetector {
  id: string;
  detect(graph: any, knowledge: any[]): Promise<Pattern[]>; // Using 'any' for mock repository graph & WiCER
}
