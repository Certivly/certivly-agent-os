import { describe, it, expect } from 'bun:test';
import { compactHistory } from '../src/loop/compactHistory';
import { ContextAssembler } from '../src/loop/ContextAssembler';
import type { LoopMessage, LoopState } from '../src/loop/types';

describe('Action 5-05: Context Window Policy', () => {
  it('1. History compaction keeps last 20 turns (plus system prompt)', () => {
    const messages: LoopMessage[] = [
      { id: 'sys-1', role: 'system', content: 'You are an agent.' },
    ];

    // Create 30 user/assistant turns
    for (let i = 1; i <= 30; i++) {
      messages.push({
        id: `msg-${i}`,
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `Turn content ${i}`,
      });
    }

    expect(messages).toHaveLength(31);

    const compacted = compactHistory(messages);

    // Should have 1 system message + last 20 messages = 21 messages total
    expect(compacted).toHaveLength(21);
    expect(compacted[0].role).toBe('system');
    expect(compacted[0].content).toBe('You are an agent.');
    expect(compacted[1].content).toBe('Turn content 11');
    expect(compacted[20].content).toBe('Turn content 30');
  });

  it('2. Old tool results are truncated beyond the 5 most recent tool pairs', () => {
    const messages: LoopMessage[] = [
      { id: 'sys-1', role: 'system', content: 'System instruction' },
    ];

    // Create 8 tool call/result pairs
    for (let i = 1; i <= 8; i++) {
      messages.push({
        id: `asst-${i}`,
        role: 'assistant',
        content: `Calling tool ${i}`,
        toolCalls: [{ id: `call-${i}`, name: 'read_file', args: `{ "file": "test${i}.ts" }` }],
      });
      messages.push({
        id: `tool-${i}`,
        role: 'tool',
        name: 'read_file',
        toolCallId: `call-${i}`,
        content: `Full verbose file content for tool ${i} with long data...`,
      });
    }

    // 8 tool messages: the first 3 should be truncated, the last 5 preserved
    const compacted = compactHistory(messages, { maxRecentTurns: 50 });

    const toolMessages = compacted.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(8);

    // Oldest 3 should have truncation notice
    expect(toolMessages[0].content).toContain('[Tool result truncated');
    expect(toolMessages[1].content).toContain('[Tool result truncated');
    expect(toolMessages[2].content).toContain('[Tool result truncated');

    // Recent 5 should retain their content
    expect(toolMessages[3].content).toBe('Full verbose file content for tool 4 with long data...');
    expect(toolMessages[7].content).toBe('Full verbose file content for tool 8 with long data...');
  });

  it('3. Resolved verification failure is removed when followed by [Verification Passed]', () => {
    const messages: LoopMessage[] = [
      { id: 'sys-1', role: 'system', content: 'System prompt' },
      { id: 'user-1', role: 'user', content: 'Fix the bug' },
      { id: 'asst-1', role: 'assistant', content: 'Edited file' },
      { id: 'verify-fail', role: 'user', content: '[Verification Failed]\nTest suite failed: expected 1 to be 2' },
      { id: 'asst-2', role: 'assistant', content: 'Fixed the assertion' },
      { id: 'verify-pass', role: 'user', content: '[Verification Passed]\nAll 15 tests passed' },
    ];

    const compacted = compactHistory(messages);

    const contents = compacted.map((m) => m.content);
    expect(contents.some((c) => c?.includes('[Verification Failed]'))).toBe(false);
    expect(contents.some((c) => c?.includes('[Verification Passed]'))).toBe(true);
  });

  it('4. ContextAssembler includes verification failure when unresolved', () => {
    const loopState: LoopState = {
      filesRead: new Set(),
      filesEdited: new Set(['src/index.ts']),
      pipelineCompleted: ['verify'],
      verificationAttempts: 1,
      lastVerificationOutput: 'Error: Cannot find module ./missing',
      loadedInstructionDirs: new Set(),
    };

    const snapshot = ContextAssembler.build(loopState, {
      userInput: 'Implement feature X',
      permissionMode: 'auto',
      verificationPassed: false,
    });

    expect(snapshot.pendingVerificationFailure).toBe('Error: Cannot find module ./missing');
    expect(snapshot.permissionMode).toBe('auto');
    expect(snapshot.pendingChangesetSummary).toBe('1 file(s) modified');

    const promptSection = ContextAssembler.toSystemPromptSection(snapshot);
    expect(promptSection).toContain('Unresolved Verification Failure');
    expect(promptSection).toContain('Error: Cannot find module ./missing');
  });

  it('5. ContextAssembler excludes stale failure after verification passes', () => {
    const loopState: LoopState = {
      filesRead: new Set(),
      filesEdited: new Set(['src/index.ts']),
      pipelineCompleted: ['verify'],
      verificationAttempts: 1,
      lastVerificationOutput: 'Previous error that got fixed',
      loadedInstructionDirs: new Set(),
    };

    const snapshot = ContextAssembler.build(loopState, {
      userInput: 'Implement feature X',
      permissionMode: 'auto',
      verificationPassed: true,
    });

    expect(snapshot.pendingVerificationFailure).toBeNull();

    const promptSection = ContextAssembler.toSystemPromptSection(snapshot);
    expect(promptSection).not.toContain('Unresolved Verification Failure');
    expect(promptSection).not.toContain('Previous error that got fixed');
  });
});
