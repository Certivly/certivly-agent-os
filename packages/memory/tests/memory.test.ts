import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryStore, MemoryExtractor, Memory } from '../src';
import { ContextEntry } from '@agent-os/context';

describe('MemoryEngine', () => {
  const dbDir = path.join(__dirname, '.agentos');
  let dbPath: string;
  let store: MemoryStore;
  let extractor: MemoryExtractor;

  beforeEach(() => {
    dbPath = path.join(dbDir, `memory-${crypto.randomUUID()}.db`);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    store = new MemoryStore(dbPath);
    extractor = new MemoryExtractor(store);
  });

  afterEach(() => {
    // Avoid EBUSY on Windows by not deleting the db files immediately,
    // or just let them sit since they are randomly named.
  });

  it('should save and retrieve memories', () => {
    const memory: Memory = {
      id: 'mem-1',
      type: 'FactMemory',
      topic: 'test',
      content: 'This is a test fact.',
      confidence: 0.9,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceEventIds: ['evt-1'],
      sourceSessionIds: ['sess-1'],
      sourceRequestIds: ['req-1'],
      tags: ['test'],
      version: 1
    };

    store.save(memory);
    const retrieved = store.getMemory('mem-1');
    expect(retrieved?.topic).toBe('test');
    expect(retrieved?.sourceEventIds[0]).toBe('evt-1');
  });

  it('should update and bump version for existing memory', () => {
    const memory: Memory = {
      id: 'mem-1',
      type: 'FactMemory',
      topic: 'test',
      content: 'v1',
      confidence: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceEventIds: [],
      sourceSessionIds: [],
      sourceRequestIds: [],
      tags: [],
      version: 1
    };

    store.save(memory);
    memory.content = 'v2';
    store.save(memory);

    const retrieved = store.getMemory('mem-1');
    expect(retrieved?.content).toBe('v2');
    expect(retrieved?.version).toBe(2);
  });

  it('should extract memories from context entries', async () => {
    const entry: ContextEntry = {
      id: 'ctx-1',
      type: 'DecisionContext',
      content: 'Project uses JWT authentication decision.',
      timestamp: new Date().toISOString(),
      sourceEventIds: ['evt-1'],
      metadata: { topic: 'authentication' }
    };

    await extractor.extractAndStore(entry);
    
    const memories = store.getMemoriesByTopic('authentication');
    expect(memories.length).toBe(1);
    expect(memories[0].content).toBe('Project uses JWT authentication decision.');
    expect(memories[0].sourceEventIds[0]).toBe('evt-1');
  });

  it('should deduplicate identical contents', async () => {
    const entry: ContextEntry = {
      id: 'ctx-1',
      type: 'MessageContext',
      content: 'duplicate fact',
      timestamp: new Date().toISOString(),
      sourceEventIds: []
    };

    await extractor.extractAndStore(entry);
    await extractor.extractAndStore(entry); // Should be ignored

    const memories = store.getMemoriesByTopic('general');
    expect(memories.length).toBe(1);
  });
});
