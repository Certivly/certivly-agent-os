import { RequestPriority } from './PriorityManager';

export interface QueuedRequest {
  id: string;
  type: string;
  priority: RequestPriority;
  payload: any;
  queuedAt: number;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];

  public enqueue(request: QueuedRequest): void {
    this.queue.push(request);
    this.sortQueue();
  }

  public dequeue(): QueuedRequest | undefined {
    return this.queue.shift();
  }

  public cancel(id: string): boolean {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(req => req.id !== id);
    return this.queue.length < initialLength;
  }

  public reprioritize(id: string, newPriority: RequestPriority): void {
    const request = this.queue.find(req => req.id === id);
    if (request) {
      request.priority = newPriority;
      this.sortQueue();
    }
  }

  public getLength(): number {
    return this.queue.length;
  }

  private sortQueue(): void {
    // Sort by priority (descending) and then by queuedAt (ascending)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.queuedAt - b.queuedAt;
    });
  }
}
