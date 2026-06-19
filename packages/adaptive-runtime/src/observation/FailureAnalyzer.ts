export class FailureAnalyzer {
  public analyze(failureEvent: any): { rootCause: string, confidence: number, suggestedAction: string } {
    if (failureEvent?.type === 'test_failure' || failureEvent?.error?.includes('test')) {
      return { rootCause: 'test_failure', confidence: 1.0, suggestedAction: 'replan' };
    }
    if (failureEvent?.type === 'validation_failure' || failureEvent?.error?.includes('validation')) {
      return { rootCause: 'validation_failure', confidence: 1.0, suggestedAction: 'replan' };
    }
    return { rootCause: 'unknown', confidence: 0.5, suggestedAction: 'retry' };
  }
}
