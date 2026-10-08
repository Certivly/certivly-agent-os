import { describe, it, expect } from 'bun:test';
import { parseOpenAIStream } from '../src/streaming/StreamParsers';
import { OpenAIProvider } from '../src/adapters/openai';
import type { StreamEvent } from '../src/interface';

describe('OpenAI Streaming Tool Parity', () => {
  it('assembles split JSON arguments correctly', async () => {
    async function* makeChunks() {
      yield {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'edit_file', arguments: '{"path":' },
                },
              ],
            },
          },
        ],
      };
      yield {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '"src/index.ts","content":"hello"}' },
                },
              ],
            },
          },
        ],
      };
      yield {
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    }

    const events: StreamEvent[] = [];
    for await (const event of parseOpenAIStream(makeChunks())) {
      events.push(event);
    }

    expect(events.some((e) => e.type === 'tool_call_start')).toBe(true);
    const endEvent = events.find((e) => e.type === 'tool_call_end') as any;
    expect(endEvent).toBeDefined();
    expect(endEvent.id).toBe('call_1');
    expect(endEvent.arguments).toEqual({
      path: 'src/index.ts',
      content: 'hello',
    });

    const doneEvent = events.find((e) => e.type === 'done') as any;
    expect(doneEvent).toBeDefined();
    expect(doneEvent.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it('assembles two parallel tool calls correctly', async () => {
    async function* makeChunks() {
      yield {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_read_1',
                  function: { name: 'read_file', arguments: '{"path":"a.ts"}' },
                },
                {
                  index: 1,
                  id: 'call_read_2',
                  function: { name: 'read_file', arguments: '{"path":"b.ts"}' },
                },
              ],
            },
          },
        ],
      };
      yield { choices: [{ delta: {} }] };
    }

    const events: StreamEvent[] = [];
    for await (const event of parseOpenAIStream(makeChunks())) {
      events.push(event);
    }

    const toolEnds = events.filter((e) => e.type === 'tool_call_end') as any[];
    expect(toolEnds.length).toBe(2);
    expect(toolEnds[0].id).toBe('call_read_1');
    expect(toolEnds[0].arguments).toEqual({ path: 'a.ts' });
    expect(toolEnds[1].id).toBe('call_read_2');
    expect(toolEnds[1].arguments).toEqual({ path: 'b.ts' });
  });

  it('yields provider error when tool call arguments JSON is malformed', async () => {
    async function* makeChunks() {
      yield {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_bad',
                  function: { name: 'broken_tool', arguments: '{"path": incomplete' },
                },
              ],
            },
          },
        ],
      };
    }

    const events: StreamEvent[] = [];
    for await (const event of parseOpenAIStream(makeChunks())) {
      events.push(event);
    }

    const errorEvent = events.find((e) => e.type === 'error') as any;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error.message).toContain('Malformed tool call arguments JSON');
  });

  it('streams tool calls via OpenAIProvider against fake HTTP server', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const sseLines = [
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_srv","function":{"name":"read_file","arguments":"{\\"path\\": \\"test.txt\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
          'data: [DONE]\n\n',
        ];

        return new Response(sseLines.join(''), {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      },
    });

    try {
      const provider = new OpenAIProvider('fake-key', `http://127.0.0.1:${server.port}/v1`);
      const model = provider.getModel('gpt-4o');
      const events: StreamEvent[] = [];

      for await (const event of (model as any).stream({
        messages: [{ role: 'user', content: 'read test.txt' }],
      })) {
        events.push(event);
      }

      const endEvent = events.find((e) => e.type === 'tool_call_end') as any;
      expect(endEvent).toBeDefined();
      expect(endEvent.id).toBe('call_srv');
      expect(endEvent.arguments).toEqual({ path: 'test.txt' });

      const doneEvent = events.find((e) => e.type === 'done') as any;
      expect(doneEvent).toBeDefined();
      expect(doneEvent.usage?.totalTokens).toBe(20);
    } finally {
      server.stop();
    }
  });
});
