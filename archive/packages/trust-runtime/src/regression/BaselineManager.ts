import { Baseline } from "./RegressionReport";

export class BaselineManager {
  private baselines: Map<string, Baseline> = new Map();

  public capture(goalId: string, baseline: Baseline): void {
    this.baselines.set(goalId, baseline);
  }

  public get(goalId: string): Baseline | undefined {
    return this.baselines.get(goalId);
  }
}
