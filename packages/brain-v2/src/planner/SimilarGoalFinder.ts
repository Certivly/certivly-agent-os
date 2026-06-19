import { SuccessRecord } from "../../../brain/src/models/SuccessRecord";
import { GoalFingerprintEngine } from "./GoalFingerprint";
import { GoalClassifier } from "./GoalClassifier";

export class SimilarGoalFinder {
  constructor(
    private fingerprintEngine: GoalFingerprintEngine,
    private classifier: GoalClassifier
  ) {}

  public findMatches(
    currentGoalDescription: string,
    currentFiles: string[],
    history: SuccessRecord[],
    goalDescriptionsMap: Map<string, string> // Map goalId to its description from history
  ): SuccessRecord[] {
    const currentSig = this.fingerprintEngine.generate(currentGoalDescription, currentFiles);
    const currentClass = this.classifier.classify(currentSig);

    const matches: SuccessRecord[] = [];

    for (const record of history) {
      const desc = goalDescriptionsMap.get(record.goalId) || "";
      const sig = this.fingerprintEngine.generate(desc, record.affectedFiles);
      const recordClass = this.classifier.classify(sig);

      // Deterministic matching based on shared fingerprint class or shared repo areas
      const sharesArea = currentSig.repositoryAreas.some(area => sig.repositoryAreas.includes(area));
      if (recordClass === currentClass || sharesArea) {
        matches.push(record);
      }
    }

    return matches;
  }
}
