import { Pattern, PatternType } from "../src/models";
import { PatternStore } from "../src/PatternStore";

export class PatternQueryEngine {
  constructor(private store: PatternStore) {}

  public findPatternByType(type: PatternType): Pattern[] {
    const snapshot = this.store.getLatestSnapshot();
    if (!snapshot) return [];
    return snapshot.patterns.filter(p => p.type === type);
  }

  public getStrongestPatterns(): Pattern[] {
    const snapshot = this.store.getLatestSnapshot();
    if (!snapshot) return [];
    // Return patterns with > 80% confidence
    return snapshot.patterns.filter(p => p.confidence >= 0.8).sort((a, b) => b.confidence - a.confidence);
  }

  public getArchitecturalStyle(): Pattern[] {
    return this.findPatternByType(PatternType.ARCHITECTURAL_STYLE);
  }

  public getTestingConventions(): Pattern[] {
    return this.findPatternByType(PatternType.TEST_LAYER);
  }

  public getValidationConventions(): Pattern[] {
    return this.findPatternByType(PatternType.VALIDATION_LAYER);
  }
}
