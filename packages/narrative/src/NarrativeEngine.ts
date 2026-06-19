import { EventBus, RuntimeEvent } from '@agent-os/events';
import { ActivityClassifier } from './ActivityClassifier';
import { ProgressTracker } from './ProgressTracker';
import { ExecutionPhase } from './ExecutionPhase';

export class NarrativeEngine {
  private classifier: ActivityClassifier;
  private progressTracker: ProgressTracker;

  constructor(private eventBus: EventBus, private sessionId: string) {
    this.classifier = new ActivityClassifier();
    this.progressTracker = new ProgressTracker();

    this.subscribeToRawEvents();
  }

  private subscribeToRawEvents() {
    this.eventBus.subscribe('*', (event: RuntimeEvent) => {
      // Only process events for the current session
      if (event.sessionId && event.sessionId !== this.sessionId) return;
      
      const classification = this.classifier.classify(event);
      if (classification) {
        this.progressTracker.startPhase(classification.phase);

        if (!this.progressTracker.hasActivity(classification.id)) {
           this.progressTracker.startActivity(classification.id, classification.message, classification.phase);
           this.publishNarrativeEvent('narrative.activity.started', classification.id);
        }

        if (classification.isComplete) {
           this.progressTracker.completeActivity(classification.id);
           this.publishNarrativeEvent('narrative.activity.completed', classification.id);
        } else if (classification.isFailure) {
           this.progressTracker.failActivity(classification.id);
           this.publishNarrativeEvent('narrative.activity.failed', classification.id);
        }
      }

      // Check if task is finished and summarize
      if (event.eventType === 'message.responded' || event.eventType === 'session.completed') {
        this.progressTracker.startPhase(ExecutionPhase.SUMMARIZE);
        this.generateAndPublishSummary();
      }
    });
  }

  private publishNarrativeEvent(type: string, activityId: string) {
    const snapshot = this.progressTracker.snapshot();
    this.eventBus.publish(type, {
      sessionId: this.sessionId,
      activityId,
      snapshot
    });
  }

  private generateAndPublishSummary() {
    // In a real implementation, we would derive this from Sandbox ValidationResults, Patch generation, etc.
    // For now, we mock a summary structure
    const summary = {
      objective: "Task execution complete",
      reasoning: ["Processed execution loop successfully"],
      modifiedFiles: [],
      testsRun: [],
      validationResults: [],
      patchSummary: []
    };
    this.progressTracker.setTaskSummary(summary);
    
    this.eventBus.publish('narrative.summary.generated', {
      sessionId: this.sessionId,
      summary
    });
  }

  public getSnapshot() {
    return this.progressTracker.snapshot();
  }
}
