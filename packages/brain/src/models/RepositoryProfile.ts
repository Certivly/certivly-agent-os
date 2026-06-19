export interface RepositoryProfile {
  framework: string | null;
  packageManager: string | null;
  testingFramework: string | null;
  architectureStyle: string | null;
  languages: string[];
  confidence: number;
}
