import { JobQueue } from './JobQueue';
import { JobExecutor } from './JobExecutor';

export class BackgroundWorker {
  private isRunning = false;
  private pollInterval: any;

  constructor(
    private queue: JobQueue,
    private executor: JobExecutor,
    private pollIntervalMs: number = 5000
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    this.pollInterval = setInterval(() => {
      this.processNext();
    }, this.pollIntervalMs);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async processNext(): Promise<void> {
    const job = this.queue.getNext();
    if (!job) return;

    try {
      await this.executor.execute(job);
      this.queue.complete(job.id);
    } catch (error) {
      this.queue.retry(job.id);
    }
  }
}
