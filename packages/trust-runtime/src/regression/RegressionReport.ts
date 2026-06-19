export interface Baseline {
  id: string;
  testCount: number;
  coverage: number;
  buildStatus: boolean;
  validationStatus: boolean;
}

export interface RegressionReport {
  id: string;
  regressions: string[];
  hasCriticalRegressions: boolean;
}
