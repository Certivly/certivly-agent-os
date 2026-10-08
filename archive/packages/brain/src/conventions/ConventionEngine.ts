import { Convention } from "../models/Convention";
import { ConventionExtractor } from "./ConventionExtractor";

export class ConventionEngine {
  constructor(private extractor: ConventionExtractor = new ConventionExtractor()) {}

  public discover(files: string[]): Convention[] {
    const allConventions: Convention[] = [];

    // Naming conventions
    const namingConventions = this.extractor.extractNamingConventions(files);
    allConventions.push(...namingConventions);

    // Sort by evidenceCount descending, then alphabetically by pattern for strict determinism
    allConventions.sort((a, b) => {
      if (b.evidenceCount !== a.evidenceCount) {
        return b.evidenceCount - a.evidenceCount;
      }
      return a.pattern.localeCompare(b.pattern);
    });

    return allConventions;
  }
}
