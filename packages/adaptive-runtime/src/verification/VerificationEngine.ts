import { Goal } from '../models/Goal';

export class VerificationEngine {
  public verify(goal: Goal, results: any[]): void {
    for (const criterion of goal.successCriteria) {
      if (criterion.type === 'test') {
        const testPassed = results.some(r => r.agentId === 'test-agent' && r.data?.failed === 0);
        if (testPassed) {
          criterion.satisfied = true;
        } else {
          criterion.satisfied = false;
        }
      } else if (criterion.type === 'validation') {
        const valPassed = results.some(r => r.agentId === 'validation-agent' && r.data?.isValid);
        if (valPassed) {
          criterion.satisfied = true;
        } else {
          criterion.satisfied = false;
        }
      } else {
        // default true for mocks
        criterion.satisfied = true;
      }
    }
  }
}
