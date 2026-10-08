import { RuntimeEvent } from '@agent-os/events';
import { ExecutionPhase } from './ExecutionPhase';

export interface ActivityClassification {
  id: string;
  message: string;
  phase: ExecutionPhase;
  isComplete: boolean;
  isFailure?: boolean;
}

export class ActivityClassifier {
  public classify(event: RuntimeEvent): ActivityClassification | null {
    const type = event.eventType;
    const payload = event.payload as any;

    // Narrative Hints natively provided by Skills
    if (payload?.narrativeHints) {
      const hint = payload.narrativeHints;
      return {
        id: `skill-${event.id}`,
        message: hint.activity,
        phase: hint.phase,
        isComplete: type === 'skill.execution.completed',
        isFailure: type === 'skill.execution.failed'
      };
    }

    // Heuristics based on event types
    if (type.startsWith('repository.')) {
      return {
        id: 'repository.read',
        message: 'Reading repository',
        phase: ExecutionPhase.UNDERSTAND,
        isComplete: type === 'repository.scan.completed',
        isFailure: type === 'repository.scan.failed'
      };
    }

    if (type.startsWith('wicer.')) {
      return {
        id: 'wicer.analyze',
        message: 'Analyzing code relationships',
        phase: ExecutionPhase.ANALYZE,
        isComplete: type === 'wicer.knowledge.generated',
        isFailure: type === 'wicer.knowledge.failed'
      };
    }
    
    if (type.startsWith('sandbox.validation.')) {
      return {
        id: 'sandbox.validation',
        message: 'Running tests',
        phase: ExecutionPhase.VALIDATE,
        isComplete: type === 'sandbox.validation.completed',
        isFailure: type === 'sandbox.validation.failed'
      };
    }

    if (type.startsWith('sandbox.patch.')) {
      return {
        id: 'sandbox.patch',
        message: 'Applying changes',
        phase: ExecutionPhase.MODIFY,
        isComplete: type === 'sandbox.patch.generated',
        isFailure: type === 'sandbox.patch.failed'
      };
    }

    if (type === 'planner.run' || type.startsWith('skillopt.')) {
      return {
        id: 'planner.plan',
        message: 'Planning changes',
        phase: ExecutionPhase.PLAN,
        isComplete: type === 'planner.run.completed',
      };
    }

    return null; // Not a user-facing event
  }
}
