import { describe, it, expect } from 'bun:test';
import { MechanicalCompactionEngine } from '../src/compaction/MechanicalCompactionEngine';
import type { LoopMessage } from '../src/loop/types';

describe('MechanicalCompactionEngine', () => {
  it('compacts older turns mechanically into <conversation_summary> with working set', () => {
    const messages: LoopMessage[] = [
      { role: 'system', content: 'You are AgentOS.' },
      { role: 'user', content: 'Fix the bug in src/math.ts and ensure tests pass' },
      {
        role: 'assistant',
        content: 'I will inspect the file',
        toolCalls: [{ id: 'tc1', name: 'read_file', args: JSON.stringify({ path: 'src/math.ts' }) }],
      },
      {
        role: 'tool',
        name: 'read_file',
        content: 'export function add(a: number, b: number) { return a + b; }\nexport function sub(a: number, b: number) { return a - b; }\n',
      },
      {
        role: 'assistant',
        content: 'Now inspecting tests',
        toolCalls: [{ id: 'tc2', name: 'read_file', args: JSON.stringify({ path: 'src/math.test.ts' }) }],
      },
      {
        role: 'tool',
        name: 'read_file',
        content: 'import { add } from "./math";\n',
      },
      {
        role: 'assistant',
        content: 'Editing math file',
        toolCalls: [{ id: 'tc3', name: 'write_file', args: JSON.stringify({ path: 'src/math.ts', content: '...' }) }],
      },
      {
        role: 'tool',
        name: 'write_file',
        content: 'Successfully wrote to src/math.ts',
      },
      {
        role: 'assistant',
        content: 'Running tests',
        toolCalls: [{ id: 'tc4', name: 'run_command', args: JSON.stringify({ command: 'bun test' }) }],
      },
      {
        role: 'tool',
        name: 'run_command',
        content: 'All 2 tests passed',
      },
      // Recent turns to keep verbatim
      { role: 'user', content: 'Now please also export divide function' },
      { role: 'assistant', content: 'Sure, I will add divide' },
    ];

    const result = MechanicalCompactionEngine.compact(messages, {
      verbatimRecentTurns: 1,
      maxPreservedFiles: 2,
    });

    expect(result.compactedMessages.length).toBeLessThan(messages.length);
    const summaryMsg = result.compactedMessages.find((m) => m.content?.includes('<conversation_summary>'));
    expect(summaryMsg).toBeDefined();

    const summaryContent = summaryMsg!.content!;
    expect(summaryContent).toContain('Fix the bug in src/math.ts');
    expect(summaryContent).toContain('src/math.ts');
    expect(summaryContent).toContain('bun test');
    // Active working set preserves unedited read file: src/math.test.ts
    expect(summaryContent).toContain('src/math.test.ts');
  });

  it('bypasses compaction when conversation is short', () => {
    const shortMessages: LoopMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    const result = MechanicalCompactionEngine.compact(shortMessages);
    expect(result.compactedMessages.length).toBe(shortMessages.length);
    expect(result.savingsRatio).toBe(0);
  });

  it('correctly maps distinct file contents using toolCallId', () => {
    const messages: LoopMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Inspect both config and schema' },
      {
        role: 'assistant',
        content: 'Reading files',
        toolCalls: [
          { id: 'call_cfg', name: 'read_file', args: JSON.stringify({ path: 'config.json' }) },
          { id: 'call_schema', name: 'read_file', args: JSON.stringify({ path: 'schema.json' }) },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call_cfg',
        name: 'read_file',
        content: '{"port": 8080}',
      },
      {
        role: 'tool',
        toolCallId: 'call_schema',
        name: 'read_file',
        content: '{"type": "object"}',
      },
      { role: 'user', content: 'Recent user message' },
      { role: 'assistant', content: 'Recent assistant answer' },
    ];

    const result = MechanicalCompactionEngine.compact(messages, {
      verbatimRecentTurns: 1,
      maxPreservedFiles: 5,
    });

    expect(result.workingSet.preservedFiles).toHaveLength(2);
    const cfg = result.workingSet.preservedFiles.find((f) => f.path === 'config.json');
    const schema = result.workingSet.preservedFiles.find((f) => f.path === 'schema.json');
    expect(cfg).toBeDefined();
    expect(cfg!.content).toBe('{"port": 8080}');
    expect(schema).toBeDefined();
    expect(schema!.content).toBe('{"type": "object"}');
  });
});
