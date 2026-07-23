import { ContextEntry, ContextSnapshot, ContextPolicy, MemoryExtractor, ContextType } from './models';
import { AgentError } from '@agent-os/shared';
import { metrics } from '@agent-os/metrics';

export class ContextStackError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'ContextStackError';
  }
}

export class ContextStack {
  private stack: ContextEntry[] = [];
  private policy: ContextPolicy;
  private extractor?: MemoryExtractor;

  constructor(policy: ContextPolicy, extractor?: MemoryExtractor) {
    this.policy = policy;
    this.extractor = extractor;
  }

  public async push(entry: ContextEntry): Promise<void> {
    this.stack.push(entry);
    await this.enforcePolicy();
  }

  public pop(): ContextEntry | undefined {
    return this.stack.pop();
  }

  public peek(): ContextEntry | undefined {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
  }

  public async evict(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      if (this.stack.length === 0) break;
      const oldest = this.stack.shift();
      if (oldest) {
        metrics.counter('context_entries_evicted').inc();
        if (this.extractor) {
          await this.extractor.extractAndStore(oldest);
        }
      }
    }
  }

  private async enforcePolicy(): Promise<void> {
    if (this.stack.length > this.policy.maxEntries) {
      const overflow = this.stack.length - this.policy.maxEntries;
      await this.evict(overflow);
    }
  }

  public snapshot(): ContextSnapshot {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      entries: [...this.stack]
    };
  }

  public restore(snapshot: ContextSnapshot): void {
    this.stack = [...snapshot.entries];
  }

  public search(query: string): ContextEntry[] {
    const lower = query.toLowerCase();
    return this.stack.filter(e => e.content.toLowerCase().includes(lower) || 
      (e.metadata && JSON.stringify(e.metadata).toLowerCase().includes(lower)));
  }

  public retrieveRecent(count: number): ContextEntry[] {
    return this.stack.slice(-count);
  }

  public retrieveByType(type: ContextType): ContextEntry[] {
    return this.stack.filter(e => e.type === type);
  }

  public retrieveByTopic(topic: string): ContextEntry[] {
    return this.stack.filter(e => e.metadata?.topic === topic);
  }

  public getAll(): ContextEntry[] {
    return [...this.stack];
  }

  public size(): number {
    return this.stack.length;
  }

  public clear(): void {
    this.stack = [];
  }
}
