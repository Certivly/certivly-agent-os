export class PatternConfidence {
  public calculate(occurrences: number, candidates: number): number {
    if (candidates === 0) return 0;
    return occurrences / candidates;
  }
}
