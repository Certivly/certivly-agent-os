import { describe, it, expect } from 'bun:test';
import { toProviderMessages } from '../src/loop/providerMessages';
import type { LoopMessage } from '../src/loop/types';

describe('toProviderMessages (Action 6-01)', () => {
  it('1. normal user -> assistant(toolCalls) -> tool -> assistant', () => {
    const history: LoopMessage[] = [
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: 'I will read the file',
        toolCalls: [{ id: 'call_1', name: 'read_file', args: '{"path":"a.ts"}' }],
      },
      {
        role: 'tool',
        toolCallId: 'call_1',
        name: 'read_file',
        content: 'file contents of a.ts',
      },
      { role: 'assistant', content: 'all done' },
    ];

    const result = toProviderMessages(history);

    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: 'I will read the file',
        toolCalls: [{ id: 'call_1', name: 'read_file', args: '{"path":"a.ts"}' }],
      },
      {
        role: 'tool',
        toolCallId: 'call_1',
        name: 'read_file',
        content: 'file contents of a.ts',
      },
      { role: 'assistant', content: 'all done' },
    ]);
  });

  it('2. orphan tool message is dropped', () => {
    const history: LoopMessage[] = [
      { role: 'user', content: 'hello' },
      {
        role: 'tool',
        toolCallId: 'call_orphan',
        name: 'some_tool',
        content: 'unexpected output',
      },
      { role: 'assistant', content: 'response' },
    ];

    const result = toProviderMessages(history);

    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'response' },
    ]);
  });

  it('3. missing result is synthesized with isError: true', () => {
    const history: LoopMessage[] = [
      { role: 'user', content: 'do something' },
      {
        role: 'assistant',
        content: 'calling tool',
        toolCalls: [{ id: 'call_missing', name: 'calc', args: '{"x":1}' }],
      },
    ];

    const result = toProviderMessages(history);

    expect(result).toEqual([
      { role: 'user', content: 'do something' },
      {
        role: 'assistant',
        content: 'calling tool',
        toolCalls: [{ id: 'call_missing', name: 'calc', args: '{"x":1}' }],
      },
      {
        role: 'tool',
        toolCallId: 'call_missing',
        name: 'calc',
        content: '[tool result missing: run was interrupted]',
        isError: true,
      },
    ]);
  });

  it('4. out-of-order results are moved right after their assistant message', () => {
    const history: LoopMessage[] = [
      {
        role: 'assistant',
        content: 'calling two tools',
        toolCalls: [
          { id: 'call_1', name: 'tool1', args: '{}' },
          { id: 'call_2', name: 'tool2', args: '{}' },
        ],
      },
      { role: 'user', content: 'interruption' },
      {
        role: 'tool',
        toolCallId: 'call_2',
        name: 'tool2',
        content: 'res2',
      },
      {
        role: 'tool',
        toolCallId: 'call_1',
        name: 'tool1',
        content: 'res1',
      },
    ];

    const result = toProviderMessages(history);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'calling two tools',
        toolCalls: [
          { id: 'call_1', name: 'tool1', args: '{}' },
          { id: 'call_2', name: 'tool2', args: '{}' },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call_1',
        name: 'tool1',
        content: 'res1',
      },
      {
        role: 'tool',
        toolCallId: 'call_2',
        name: 'tool2',
        content: 'res2',
      },
      { role: 'user', content: 'interruption' },
    ]);
  });

  it('5. two parallel tool calls keep order', () => {
    const history: LoopMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call_a', name: 'toolA', args: '{"a":1}' },
          { id: 'call_b', name: 'toolB', args: '{"b":2}' },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call_a',
        name: 'toolA',
        content: 'result A',
      },
      {
        role: 'tool',
        toolCallId: 'call_b',
        name: 'toolB',
        content: 'result B',
      },
    ];

    const result = toProviderMessages(history);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call_a', name: 'toolA', args: '{"a":1}' },
          { id: 'call_b', name: 'toolB', args: '{"b":2}' },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call_a',
        name: 'toolA',
        content: 'result A',
      },
      {
        role: 'tool',
        toolCallId: 'call_b',
        name: 'toolB',
        content: 'result B',
      },
    ]);
  });

  it('6. empty assistant without tool calls is dropped', () => {
    const history: LoopMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: '   ' },
      { role: 'assistant', content: 'real reply' },
    ];

    const result = toProviderMessages(history);

    expect(result).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'real reply' },
    ]);
  });

  it('7. mid-conversation system message becomes [system note] ... user message', () => {
    const history: LoopMessage[] = [
      { role: 'system', content: 'initial system instruction' },
      { role: 'user', content: 'hello' },
      { role: 'system', content: 'update prompt note' },
      { role: 'assistant', content: 'understood' },
    ];

    const result = toProviderMessages(history);

    expect(result).toEqual([
      { role: 'system', content: 'initial system instruction' },
      { role: 'user', content: 'hello' },
      { role: 'user', content: '[system note] update prompt note' },
      { role: 'assistant', content: 'understood' },
    ]);
  });

  it('8. compaction case: history that starts with a tool message (cut by compactHistory) -> leading orphan dropped', () => {
    const history: LoopMessage[] = [
      {
        role: 'tool',
        toolCallId: 'call_truncated_prev',
        name: 'read_file',
        content: 'some truncated context',
      },
      { role: 'user', content: 'continue please' },
    ];

    const result = toProviderMessages(history);

    expect(result).toEqual([
      { role: 'user', content: 'continue please' },
    ]);
  });
});
