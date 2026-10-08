import { LearnedPattern } from "../models/LearnedPattern";
import { SuccessPatternMiner } from "./SuccessPatternMiner";
import { FailurePatternMiner } from "./FailurePatternMiner";

export class PatternMiner {
  constructor(
    private successMiner: SuccessPatternMiner,
    private failureMiner: FailurePatternMiner
  ) {}

  public mine(): LearnedPattern[] {
    const successPatterns = this.successMiner.mine();
    const failurePatterns = this.failureMiner.mine();

    const allPatterns = [...successPatterns, ...failurePatterns];
    
    // Sort deterministically
    return allPatterns.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.id.localeCompare(b.id);
    });
  }
}
