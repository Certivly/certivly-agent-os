import { Goal } from '../models/Goal';

export class VerificationEngine {
  public verify(goal: Goal, results: any[]): void {
    for (const criterion of goal.successCriteria) {
      if (criterion.type === 'test') {
        const testPassed = results.some(r => r.agentId === 'test-agent' && r.data?.failed === 0);
        criterion.satisfied = testPassed;
      } else if (criterion.type === 'validation') {
        const valPassed = results.some(r => r.agentId === 'validation-agent' && r.data?.isValid);
        criterion.satisfied = valPassed;
      } else {
        criterion.satisfied = true;
      }
    }
  }
}
