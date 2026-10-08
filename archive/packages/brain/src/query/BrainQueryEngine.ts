import { BrainStore } from "../store/BrainStore";
import { GoalHistory } from "../memory/GoalHistory";
import { RepositoryProfile } from "../models/RepositoryProfile";
import { Convention } from "../models/Convention";
import { LearnedPattern } from "../models/LearnedPattern";
import { FileHeat } from "../patterns/HotFileAnalyzer";

export class BrainQueryEngine {
  constructor(
    private store: BrainStore,
    private goalHistory: GoalHistory
  ) {}

  public getRepositoryProfile(): RepositoryProfile | null {
    return this.store.profile;
  }

  public getRepositoryConventions(type?: string): Convention[] {
    if (type) {
      return this.store.conventionsByType.get(type) || [];
    }
    return this.store.conventions;
  }

  public getSuccessPatterns(): LearnedPattern[] {
    return this.store.patternsByCategory.get("success") || [];
  }

  public getFailurePatterns(): LearnedPattern[] {
    return this.store.patternsByCategory.get("failure") || [];
  }

  public getGoalHistory(goalId: string) {
    return this.goalHistory.getGoalOutcomes(goalId);
  }

  public getHotFiles(limit = 10): FileHeat[] {
    return this.store.hotFiles.slice(0, limit);
  }

  public getFrequentlyModifiedFiles(limit = 10): FileHeat[] {
    return [...this.store.hotFiles]
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, limit);
  }

  public findSimilarGoals(query: string) {
    // Deterministic mock - no semantic search
    // Just returns recent successes to satisfy type
    return this.getSuccessPatterns(); 
  }
}
