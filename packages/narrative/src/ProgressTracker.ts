import { ExecutionPhase } from './ExecutionPhase';
import { UserFacingActivity, TaskSummary } from './UserFacingEvent';

export class ProgressTracker {
  private activePhase: ExecutionPhase = ExecutionPhase.UNDERSTAND;
  private activities: Map<string, UserFacingActivity> = new Map();
  private taskSummary: TaskSummary | null = null;

  public startPhase(phase: ExecutionPhase) {
    this.activePhase = phase;
  }

  public currentPhase(): ExecutionPhase {
    return this.activePhase;
  }

  public startActivity(id: string, message: string, phase: ExecutionPhase = this.activePhase) {
    this.activities.set(id, {
      id,
      phase,
      message,
      status: 'active',
      startedAt: Date.now()
    });
  }

  public completeActivity(id: string) {
    const activity = this.activities.get(id);
    if (activity && activity.status !== 'completed') {
      activity.status = 'completed';
      activity.completedAt = Date.now();
    }
  }

  public failActivity(id: string) {
    const activity = this.activities.get(id);
    if (activity && activity.status !== 'failed') {
      activity.status = 'failed';
      activity.completedAt = Date.now();
    }
  }
  
  public hasActivity(id: string): boolean {
    return this.activities.has(id);
  }

  public setTaskSummary(summary: TaskSummary) {
    this.taskSummary = summary;
  }

  public snapshot() {
    return {
      activePhase: this.activePhase,
      activities: Array.from(this.activities.values()),
      taskSummary: this.taskSummary
    };
  }
}
