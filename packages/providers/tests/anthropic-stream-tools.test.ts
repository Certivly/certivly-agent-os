import { describe, it, expect } from 'bun:test';
import { parseAnthropicSSEStream } from '../src/streaming/StreamParsers';
import { AnthropicProvider } from '../src/adapters/anthropic';
import type { StreamEvent } from '../src/interface';

describe('Anthropic Streaming Tool Parity', () => {
  it('assembles split input_json_delta correctly', async () => {
    async function* makeLines() {
      yield 'data: {"type":"message_start","message":{"usage":{"input_tokens":25}}}\n';
      yield 'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_ant_1","name":"write_file"}}\n';
      yield 'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\""}}\n';
      yield 'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"out.txt\\",\\"content\\":\\"ok\\"}"}}\n';
      yield 'data: {"type":"content_block_stop","index":0}\n';
      yield 'data: {"type":"message_delta","usage":{"output_tokens":15}}\n';
      yield 'data: {"type":"message_stop"}\n';
    }

    const events: StreamEvent[] = [];
    for await (const event of parseAnthropicSSEStream(makeLines())) {
      events.push(event);
    }

    expect(events.some((e) => e.type === 'tool_call_start')).toBe(true);
    const endEvent = events.find((e) => e.type === 'tool_call_end') as any;
    expect(endEvent).toBeDefined();
    expect(endEvent.id).toBe('tool_ant_1');
    expect(endEvent.arguments).toEqual({
      path: 'out.txt',
      content: 'ok',
    });

    const doneEvent = events.find((e) => e.type === 'done') as any;
    expect(doneEvent).toBeDefined();
    expect(doneEvent.usage).toEqual({
      inputTokens: 25,
      outputTokens: 15,
      totalTokens: 40,
    });
  });

  it('yields error on malformed JSON in tool block', async () => {
    async function* makeLines() {
      yield 'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_bad","name":"bad_tool"}}\n';
      yield 'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{not-valid"}}\n';
      yield 'data: {"type":"content_block_stop","index":0}\n';
    }

    const events: StreamEvent[] = [];
    for await (const event of parseAnthropicSSEStream(makeLines())) {
      events.push(event);
    }

    const errEvent = events.find((e) => e.type === 'error') as any;
    expect(errEvent).toBeDefined();
    expect(errEvent.error.message).toContain('Malformed tool call arguments JSON');
  });

  it('streams text and tool calls via AnthropicProvider against fake HTTP server', async () => {
    const sseBody = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":50}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I will check the file."}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call_check","name":"read_file"}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"foo.md\\"}"}}\n\n',
      'data: {"type":"content_block_stop","index":1}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":30}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('');

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => {
        return new Response(sseBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }) as any;

      const provider = new AnthropicProvider('mock-key');
      const model = provider.getModel('claude-3-5-sonnet-20241022');
      const events: StreamEvent[] = [];

      for await (const event of (model as any).stream({
        messages: [{ role: 'user', content: 'check foo' }],
      })) {
        events.push(event);
      }

      const textDeltas = events.filter((e) => e.type === 'text_delta') as any[];
      expect(textDeltas.map((d) => d.text).join('')).toBe('I will check the file.');

      const toolEnd = events.find((e) => e.type === 'tool_call_end') as any;
      expect(toolEnd).toBeDefined();
      expect(toolEnd.id).toBe('call_check');
      expect(toolEnd.arguments).toEqual({ path: 'foo.md' });

      const done = events.find((e) => e.type === 'done') as any;
      expect(done).toBeDefined();
      expect(done.usage?.totalTokens).toBe(80);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
