import { RepositoryProfile } from "../models/RepositoryProfile";
import { Convention } from "../models/Convention";
import { LearnedPattern } from "../models/LearnedPattern";
import { FileHeat } from "../patterns/HotFileAnalyzer";

export class BrainStore {
  public profile: RepositoryProfile | null = null;
  public conventions: Convention[] = [];
  public patterns: LearnedPattern[] = [];
  public hotFiles: FileHeat[] = [];

  // Used for O(1) query indexing
  public conventionsByType = new Map<string, Convention[]>();
  public patternsByCategory = new Map<string, LearnedPattern[]>();

  public rebuildIndexes() {
    this.conventionsByType.clear();
    for (const c of this.conventions) {
      if (!this.conventionsByType.has(c.type)) this.conventionsByType.set(c.type, []);
      this.conventionsByType.get(c.type)!.push(c);
    }

    this.patternsByCategory.clear();
    for (const p of this.patterns) {
      if (!this.patternsByCategory.has(p.category)) this.patternsByCategory.set(p.category, []);
      this.patternsByCategory.get(p.category)!.push(p);
    }
  }
}
