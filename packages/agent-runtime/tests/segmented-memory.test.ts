import { describe, it, expect } from 'bun:test';
import { SegmentedMemoryStore } from '../src/memory/SegmentedMemoryStore';

describe('SegmentedMemoryStore (Qwen Code 3-tier Memory Architecture)', () => {
  it('1. manages episodic memory history with rolling turn limit', () => {
    const store = new SegmentedMemoryStore();
    for (let i = 1; i <= 5; i++) {
      store.recordEpisodic({
        turn: i,
        role: i % 2 === 1 ? 'user' : 'assistant',
        summary: `Turn summary ${i}`,
      });
    }

    const history = store.getEpisodicHistory(3);
    expect(history.length).toBe(3);
    expect(history[0].turn).toBe(3);
    expect(history[2].turn).toBe(5);
  });

  it('2. stores and queries long-term facts by relevance and tags', () => {
    const store = new SegmentedMemoryStore();
    store.rememberFact({
      id: 'rule-zero-catch',
      category: 'convention',
      content: 'Strictly adhere to Zero Empty-Catch policy across all source code.',
      tags: ['error-handling', 'quality', 'ts'],
      confidence: 1.0,
    });
    store.rememberFact({
      id: 'rule-bun-runtime',
      category: 'architecture',
      content: 'Use Bun runtime for scripts, testing, and bundling.',
      tags: ['bun', 'runtime'],
      confidence: 1.0,
    });

    const results = store.queryLongTerm('error-handling catch');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('rule-zero-catch');
    expect(results[0].content).toContain('Zero Empty-Catch');
  });

  it('3. manages prospective task plan states and milestones', () => {
    const store = new SegmentedMemoryStore();
    store.setGoal('Build authentication system');
    store.setTaskPlan([
      { id: 'task-1', description: 'Design JWT schema', status: 'completed' },
      { id: 'task-2', description: 'Implement token verification middleware', status: 'in_progress' },
      { id: 'task-3', description: 'Write unit tests', status: 'pending' },
    ]);

    expect(store.getGoal()).toBe('Build authentication system');
    store.updateTaskStatus('task-2', 'completed', 'verified with test runner');

    const updated = store.getTaskPlan();
    expect(updated.find(t => t.id === 'task-2')?.status).toBe('completed');
    expect(updated.find(t => t.id === 'task-2')?.notes).toBe('verified with test runner');
  });

  it('4. formats compact unified context prompt for local token budget', () => {
    const store = new SegmentedMemoryStore({
      initialFacts: [
        {
          id: 'fact-1',
          category: 'convention',
          content: 'No arbitrary any types without strict verification.',
          tags: ['typescript'],
          confidence: 0.9,
          updatedAt: Date.now(),
        },
      ],
      initialPlan: [
        { id: 'task-1', description: 'Refactor auth controller', status: 'in_progress' },
      ],
    });

    store.setGoal('Auth refactoring');
    store.recordEpisodic({
      turn: 1,
      role: 'user',
      summary: 'Please refactor auth controller',
    });

    const prompt = store.formatContextPrompt('typescript');
    expect(prompt).toContain('### [Long-Term Guidelines & Architecture Invariants]');
    expect(prompt).toContain('No arbitrary any types');
    expect(prompt).toContain('### [Task Plan & Milestones]');
    expect(prompt).toContain('Auth refactoring');
    expect(prompt).toContain('### [Recent Turn Digest]');
  });
});
