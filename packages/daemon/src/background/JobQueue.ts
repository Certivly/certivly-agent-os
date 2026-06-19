export enum BackgroundJobType {
  MEMORY_DISTILLATION,
  CONVENTION_LEARNING,
  ADR_GENERATION,
  REPOSITORY_REFRESH,
  KNOWLEDGE_COMPACTION
}

export interface BackgroundJob {
  id: string;
  type: BackgroundJobType;
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retries: number;
}

export class JobQueue {
  private queue: BackgroundJob[] = [];

  public enqueue(type: BackgroundJobType, payload: any): void {
    this.queue.push({
      id: crypto.randomUUID(),
      type,
      payload,
      status: 'pending',
      retries: 0
    });
  }

  public getNext(): BackgroundJob | undefined {
    const job = this.queue.find(j => j.status === 'pending');
    if (job) {
      job.status = 'processing';
    }
    return job;
  }

  public complete(id: string): void {
    this.queue = this.queue.filter(j => j.id !== id);
  }

  public retry(id: string): void {
    const job = this.queue.find(j => j.id === id);
    if (job && job.retries < 3) {
      job.status = 'pending';
      job.retries += 1;
    } else if (job) {
      job.status = 'failed';
    }
  }

  public getLength(): number {
    return this.queue.filter(j => j.status === 'pending').length;
  }
}
