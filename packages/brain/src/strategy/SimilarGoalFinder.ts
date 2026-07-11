import { SuccessRecord } from '../models';
import { GoalFingerprintEngine } from './GoalFingerprintEngine';

export class SimilarGoalFinder {
  private fingerprintEngine = new GoalFingerprintEngine();

  public findMatches(
    currentGoalDescription: string,
    currentFiles: string[],
    history: SuccessRecord[],
    goalDescriptionsMap: Map<string, string>
  ): SuccessRecord[] {
    const currentSig = this.fingerprintEngine.generate(currentGoalDescription, currentFiles);

    return history.filter(record => {
      const desc = goalDescriptionsMap.get(record.goalId) || '';
      const sig = this.fingerprintEngine.generate(desc, record.affectedFiles);
      const sharesArea = currentSig.repositoryAreas.some(area => sig.repositoryAreas.includes(area));
      return (
        (sig.action === currentSig.action && sig.domain === currentSig.domain) ||
        sharesArea
      );
    });
  }
}
