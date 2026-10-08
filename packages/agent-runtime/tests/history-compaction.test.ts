import { describe, it, expect } from 'bun:test';
import { compactHistory, estimateTokenCount } from '../src/loop/compactHistory';
import type { LoopMessage } from '../src/loop/types';

describe('History Compaction', () => {
  it('should leave short history unchanged', () => {
    const messages: LoopMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    const result = compactHistory(messages, 1000, 6);
    expect(result).toHaveLength(2);
    expect(result).toEqual(messages);
  });

  it('should return fewer messages for long history while preserving the last 6 turns', () => {
    const messages: LoopMessage[] = [];
    // Create 10 turns (20 messages), each message 200 chars
    for (let i = 1; i <= 10; i++) {
      messages.push({
        role: 'user',
        content: `User turn ${i}: ${'x'.repeat(200)}`,
      });
      messages.push({
        role: 'assistant',
        content: `Assistant turn ${i}: ${'y'.repeat(200)}`,
      });
    }

    // Total length = 20 * ~215 chars = ~4300 chars => ~1075 tokens
    // Set maxApproxTokens to 500, threshold is 400. 1075 > 400, so compacts
    const result = compactHistory(messages, 500, 6);

    // Should have 1 summary message + 6 turns (6 user/assistant messages) = 7 messages
    expect(result.length).toBeLessThan(messages.length);
    expect(result[0].role).toBe('assistant');
    expect(result[0].content).toContain('[Summary of earlier conversation]:');

    // The last 6 messages in result should be the last 6 messages of original
    const preserved = result.slice(1);
    expect(preserved).toHaveLength(6);
    expect(preserved[preserved.length - 1].content).toBe(messages[messages.length - 1].content);
  });

  it('should not split tool-call and tool-result pairs', () => {
    const messages: LoopMessage[] = [];
    // Old messages
    for (let i = 1; i <= 8; i++) {
      messages.push({ role: 'user', content: `Turn ${i} user` });
      messages.push({ role: 'assistant', content: `Turn ${i} assistant` });
    }

    // Now a turn with assistant tool call and tool result
    messages.push({
      role: 'assistant',
      content: 'I will call a tool',
      toolCalls: [{ id: 'tc-1', name: 'search_files', args: '{"q":"foo"}' }],
    });
    messages.push({
      role: 'tool',
      name: 'search_files',
      toolCallId: 'tc-1',
      content: 'found foo.ts',
      isError: false,
    });
    // And more user/assistant turns
    messages.push({ role: 'user', content: 'Great, thanks' });
    messages.push({ role: 'assistant', content: 'You are welcome' });

    // Force compaction
    const result = compactHistory(messages, 20, 4);

    // Verify the tool result and its tool call assistant message are either both preserved or both summarized
    const toolMsgIndex = result.findIndex(m => m.role === 'tool');
    if (toolMsgIndex !== -1) {
      // Must be preceded by assistant message with toolCalls
      const prevMsg = result[toolMsgIndex - 1];
      expect(prevMsg.role).toBe('assistant');
      expect(prevMsg.toolCalls).toBeDefined();
    }
  });

  it('should provide summary message containing provenance of earlier messages and tools', () => {
    const messages: LoopMessage[] = [
      { role: 'user', content: 'Please run tests for the project' },
      {
        role: 'assistant',
        content: 'Running tests now',
        toolCalls: [{ id: 'c-1', name: 'run_command', args: '{"cmd":"bun test"}' }],
      },
      {
        role: 'tool',
        name: 'run_command',
        toolCallId: 'c-1',
        content: '10 pass, 0 fail',
        isError: false,
      },
    ];

    // Add 6 turns to push the above into the summary
    for (let i = 1; i <= 6; i++) {
      messages.push({ role: 'user', content: `Follow-up ${i} ${'z'.repeat(100)}` });
      messages.push({ role: 'assistant', content: `Reply ${i} ${'w'.repeat(100)}` });
    }

    const result = compactHistory(messages, 200, 6);
    expect(result[0].content).toContain('run_command');
    expect(result[0].content).toContain('succeeded');
    expect(result[0].content).toContain('Please run tests');
  });
});
