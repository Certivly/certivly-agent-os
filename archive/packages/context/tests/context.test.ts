import { describe, it, expect } from 'bun:test';
import { ContextStack } from '../src/stack';
import { ContextEntry, MemoryExtractor } from '../src/models';

function makeEntry(content: string, type: any = 'TaskContext', metadata?: Record<string, any>): ContextEntry {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    timestamp: new Date().toISOString(),
    sourceEventIds: [],
    sourceRequestIds: [],
    sourceSessionIds: [],
    metadata
  };
}

describe('ContextStack', () => {
  it('should push and peek entries', async () => {
    const stack = new ContextStack({ maxEntries: 10 });
    const entry = makeEntry('hello world');
    await stack.push(entry);
    expect(stack.peek()).toEqual(entry);
    expect(stack.size()).toBe(1);
  });

  it('should enforce maxEntries policy by evicting oldest', async () => {
    const stack = new ContextStack({ maxEntries: 3 });
    const e1 = makeEntry('first');
    const e2 = makeEntry('second');
    const e3 = makeEntry('third');
    const e4 = makeEntry('fourth');

    await stack.push(e1);
    await stack.push(e2);
    await stack.push(e3);
    await stack.push(e4); // should evict e1

    expect(stack.size()).toBe(3);
    expect(stack.getAll().map(e => e.content)).toEqual(['second', 'third', 'fourth']);
  });

  it('should call extractor on eviction', async () => {
    const extracted: ContextEntry[] = [];
    const extractor: MemoryExtractor = {
      extractAndStore: async (entry) => { extracted.push(entry); }
    };

    const stack = new ContextStack({ maxEntries: 2 }, extractor);
    const e1 = makeEntry('one');
    const e2 = makeEntry('two');
    const e3 = makeEntry('three');

    await stack.push(e1);
    await stack.push(e2);
    await stack.push(e3);

    expect(extracted.length).toBe(1);
    expect(extracted[0].content).toBe('one');
  });

  it('should snapshot and restore', async () => {
    const stack = new ContextStack({ maxEntries: 10 });
    await stack.push(makeEntry('a'));
    await stack.push(makeEntry('b'));

    const snap = stack.snapshot();
    stack.clear();
    expect(stack.size()).toBe(0);

    stack.restore(snap);
    expect(stack.size()).toBe(2);
  });

  it('should search by content', async () => {
    const stack = new ContextStack({ maxEntries: 10 });
    await stack.push(makeEntry('add user authentication'));
    await stack.push(makeEntry('fix database connection'));
    await stack.push(makeEntry('add logging to auth module'));

    const results = stack.search('auth');
    expect(results.length).toBe(2);
  });

  it('should retrieveByType', async () => {
    const stack = new ContextStack({ maxEntries: 10 });
    await stack.push(makeEntry('task1', 'TaskContext'));
    await stack.push(makeEntry('file1', 'FileContext'));
    await stack.push(makeEntry('task2', 'TaskContext'));

    const tasks = stack.retrieveByType('TaskContext');
    expect(tasks.length).toBe(2);
    expect(tasks.every(e => e.type === 'TaskContext')).toBe(true);
  });

  it('should retrieveByTopic', async () => {
    const stack = new ContextStack({ maxEntries: 10 });
    await stack.push(makeEntry('auth task', 'TaskContext', { topic: 'auth' }));
    await stack.push(makeEntry('db task', 'TaskContext', { topic: 'database' }));
    await stack.push(makeEntry('auth detail', 'DecisionContext', { topic: 'auth' }));

    const authEntries = stack.retrieveByTopic('auth');
    expect(authEntries.length).toBe(2);
  });

  it('should retrieveRecent', async () => {
    const stack = new ContextStack({ maxEntries: 10 });
    for (let i = 0; i < 5; i++) {
      await stack.push(makeEntry(`entry ${i}`));
    }
    const recent = stack.retrieveRecent(2);
    expect(recent.length).toBe(2);
    expect(recent[0].content).toBe('entry 3');
    expect(recent[1].content).toBe('entry 4');
  });
});
