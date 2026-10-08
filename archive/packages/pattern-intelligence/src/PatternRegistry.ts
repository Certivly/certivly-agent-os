import { PatternDetector } from "./models";

export class PatternRegistry {
  private detectors: PatternDetector[] = [];

  public register(detector: PatternDetector) {
    this.detectors.push(detector);
  }

  public getDetectors(): PatternDetector[] {
    return this.detectors;
  }
}
