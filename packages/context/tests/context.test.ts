import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ContextStack, ContextEntry, MemoryExtractor } from '../src';

describe('ContextStack', () => {
  let stack: ContextStack;
  let mockExtractor: MemoryExtractor;
  let extractedItems: ContextEntry[] = [];

  beforeEach(() => {
    extractedItems = [];
    mockExtractor = {
      extractAndStore: async (entry) => {
        extractedItems.push(entry);
      }
    };
    stack = new ContextStack({ maxEntries: 3 }, mockExtractor);
  });

  const createEntry = (id: string, type: any = 'MessageContext'): ContextEntry => ({
    id,
    type,
    content: `content ${id}`,
    timestamp: new Date().toISOString(),
    sourceEventIds: []
  });

  it('should push and pop entries', async () => {
    await stack.push(createEntry('1'));
    await stack.push(createEntry('2'));
    
    const top = stack.peek();
    expect(top?.id).toBe('2');
    
    const popped = stack.pop();
    expect(popped?.id).toBe('2');
    expect(stack.peek()?.id).toBe('1');
  });

  it('should trigger eviction and memory extraction when limits exceeded', async () => {
    await stack.push(createEntry('1'));
    await stack.push(createEntry('2'));
    await stack.push(createEntry('3'));
    await stack.push(createEntry('4')); // Should trigger eviction of '1'
    
    expect(stack.getAll().length).toBe(3);
    expect(stack.getAll()[0].id).toBe('2'); // 1 was evicted
    
    expect(extractedItems.length).toBe(1);
    expect(extractedItems[0].id).toBe('1');
  });

  it('should snapshot and restore correctly', async () => {
    await stack.push(createEntry('1'));
    await stack.push(createEntry('2'));
    
    const snap = stack.snapshot();
    expect(snap.entries.length).toBe(2);
    
    await stack.push(createEntry('3'));
    expect(stack.getAll().length).toBe(3);
    
    stack.restore(snap);
    expect(stack.getAll().length).toBe(2);
    expect(stack.peek()?.id).toBe('2');
  });

  it('should retrieve correctly by type', async () => {
    await stack.push(createEntry('1', 'TaskContext'));
    await stack.push(createEntry('2', 'MessageContext'));
    await stack.push(createEntry('3', 'TaskContext'));
    
    const tasks = stack.retrieveByType('TaskContext');
    expect(tasks.length).toBe(2);
    expect(tasks[0].id).toBe('1');
    expect(tasks[1].id).toBe('3');
  });
});
