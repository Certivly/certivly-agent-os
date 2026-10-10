import { describe, it, expect } from 'bun:test';
import { ContextPruner, contextPruner } from '../src/compaction/ContextPruner';
import type { LoopMessage } from '../src/loop/types';

describe('ContextPruner (Freebuff Autonomous Context Pruning Pattern)', () => {
  it('1. leaves context unchanged when below maxContextTokens and within cache TTL', () => {
    const messages: LoopMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Write a quick function' },
      { role: 'assistant', content: 'Here is the function' },
    ];

    const result = contextPruner.prune(messages, Date.now());
    expect(result.prunedMessages.length).toBe(messages.length);
    expect(result.audit.savingsRatio).toBe(0);
    expect(result.audit.cacheExpired).toBe(false);
  });

  it('2. scrubs verbose intermediate outputs from completed subagents', () => {
    const largeSubagentLog = 'SEARCH_RESULT: ' + 'file data line '.repeat(100);
    const messages: LoopMessage[] = [
      { role: 'system', content: 'You are AgentOS' },
      { role: 'user', content: 'Find authentication logic' },
      {
        role: 'assistant',
        content: 'Spawning file picker',
        toolCalls: [{ id: 'tc_picker', name: 'file-picker', args: '{}' }],
      },
      {
        role: 'tool',
        toolCallId: 'tc_picker',
        name: 'file-picker',
        content: `Candidate: src/auth.ts\n${largeSubagentLog}`,
      },
      { role: 'assistant', content: 'Inspected candidate file' },
      { role: 'user', content: 'Next step please' },
    ];

    const pruner = new ContextPruner();
    const result = pruner.prune(messages, Date.now(), {
      maxContextTokens: 100, // force trigger
    });

    expect(result.audit.subagentsScrubbed).toBeGreaterThan(0);
    const scrubbedToolMsg = result.prunedMessages.find((m) => m.name === 'file-picker');
    expect(scrubbedToolMsg).toBeDefined();
    expect(scrubbedToolMsg!.content).toContain('Candidate: src/auth.ts');
    expect(scrubbedToolMsg!.content).toContain('intermediate search/trace steps scrubbed');
  });

  it('3. enforces asymmetric budgeting: protects user instructions while capping tool outputs', () => {
    const longUserRequirement = 'CRITICAL REQUIREMENT: ' + 'must adhere to RFC 7519. '.repeat(10);
    const massiveToolOutput = 'STACK DUMP: ' + 'error at line '.repeat(200);

    const messages: LoopMessage[] = [
      { role: 'system', content: 'System' },
      { role: 'user', content: longUserRequirement },
      { role: 'assistant', content: 'Running command' },
      { role: 'tool', name: 'run_command', content: massiveToolOutput },
      { role: 'user', content: 'What is the error?' },
      { role: 'assistant', content: 'Checking...' },
    ];

    const pruner = new ContextPruner();
    const result = pruner.prune(messages, Date.now(), {
      maxContextTokens: 100,
      toolTokenBudget: 50,
      userTokenBudget: 5000,
    });

    // User requirement should remain complete
    const userMsg = result.prunedMessages.find((m) => m.role === 'user');
    expect(userMsg!.content).toContain('CRITICAL REQUIREMENT');

    // Massive tool output should be capped under budget
    const toolMsg = result.prunedMessages.find((m) => m.role === 'tool');
    expect(toolMsg!.content).toContain('Output truncated under assistant/tool context budget');
  });

  it('4. triggers pruning when cache TTL (5 minutes) has expired', () => {
    const messages: LoopMessage[] = [
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Task 1' },
      { role: 'assistant', content: 'Done' },
      { role: 'user', content: 'Task 2' },
      { role: 'assistant', content: 'Done' },
    ];

    const pruner = new ContextPruner();
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;

    const result = pruner.prune(messages, sixMinutesAgo, {
      cacheExpiryMs: 5 * 60 * 1000,
      maxContextTokens: 100_000, // Even with high threshold, expiry triggers pruning
    });

    expect(result.audit.cacheExpired).toBe(true);
  });
});
