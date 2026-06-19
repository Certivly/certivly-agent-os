export class AgentMetrics {
  public tasksCreated = 0;
  public tasksCompleted = 0;
  public tasksFailed = 0;
  public tasksCancelled = 0;
  public retries = 0;
  
  public currentParallelism = 0;
  public peakParallelism = 0;
  public queueDepth = 0;

  public totalExecutionTimeMs = 0;

  recordTaskCreated() { this.tasksCreated++; this.queueDepth++; }
  recordTaskStarted() { 
    this.queueDepth--; 
    this.currentParallelism++; 
    if (this.currentParallelism > this.peakParallelism) {
      this.peakParallelism = this.currentParallelism;
    }
  }
  recordTaskCompleted(duration: number) { 
    this.tasksCompleted++; 
    this.currentParallelism--; 
    this.totalExecutionTimeMs += duration;
  }
  recordTaskFailed() { this.tasksFailed++; this.currentParallelism--; }
  recordTaskCancelled() { this.tasksCancelled++; }
  recordRetry() { this.retries++; }
}
