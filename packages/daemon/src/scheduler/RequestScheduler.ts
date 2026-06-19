import { RequestQueue, QueuedRequest } from './RequestQueue';
import { PriorityManager } from './PriorityManager';
import { RuntimePool } from '../sessions/RuntimePool';

export class RequestScheduler {
  private isProcessing = false;

  constructor(
    private queue: RequestQueue,
    private runtimePool: RuntimePool
  ) {}

  public async schedule(request: { id: string; type: string; payload: any }): Promise<any> {
    return new Promise((resolve, reject) => {
      const priority = PriorityManager.getPriorityForType(request.type);
      
      const queuedRequest: QueuedRequest = {
        ...request,
        priority,
        queuedAt: Date.now(),
        resolve,
        reject
      };

      this.queue.enqueue(queuedRequest);
      this.processNext(); // Fire and forget trigger
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    
    const request = this.queue.dequeue();
    if (!request) return;

    this.isProcessing = true;

    try {
      // In full impl, this finds the correct runtime based on session/repository affinity
      const sessionId = request.payload.sessionId || 'default';
      const runtime = this.runtimePool.acquireRuntime(sessionId);
      
      const result = await runtime.execute(request.payload);
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.isProcessing = false;
      // Re-trigger in case more items are queued
      setTimeout(() => this.processNext(), 0);
    }
  }
}
