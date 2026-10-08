import { describe, it, expect } from 'bun:test';
import {
  OpenAIProvider,
  AnthropicProvider,
  AuthError,
  RateLimitError,
  ContextLengthError,
  fetchWithRetry,
  classifyError,
} from '../src';
import type { Server } from 'bun';

describe('Action 6-04: Provider Retry, Abort, Typed Errors, and Usage', () => {
  it('1. fetchWithRetry retries on 429 and succeeds when next attempt returns 200', async () => {
    let callCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'rate limited' }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '0.01',
            },
          });
        }
        return new Response(JSON.stringify({ ok: true, callCount }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      const res = await fetchWithRetry(`${server.url}/test`, { method: 'GET' }, {
        initialDelayMs: 10,
        providerName: 'TestProvider',
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.callCount).toBe(2);
      expect(callCount).toBe(2);
    } finally {
      server.stop(true);
    }
  });

  it('2. fetchWithRetry throws RateLimitError when 429 retries are exhausted', async () => {
    let callCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        callCount++;
        return new Response(JSON.stringify({ error: 'rate limit exceeded' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '0.01',
          },
        });
      },
    });

    try {
      let thrown: any = null;
      try {
        await fetchWithRetry(`${server.url}/test`, { method: 'GET' }, {
          maxAttempts: 3,
          initialDelayMs: 10,
          providerName: 'TestProvider',
        });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(RateLimitError);
      expect(thrown.name).toBe('RateLimitError');
      expect(thrown.retryAfterMs).toBe(10);
      expect(callCount).toBe(3);
    } finally {
      server.stop(true);
    }
  });

  it('3. fetchWithRetry throws AuthError on 401 without retrying', async () => {
    let callCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        callCount++;
        return new Response(JSON.stringify({ error: 'invalid api key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      let thrown: any = null;
      try {
        await fetchWithRetry(`${server.url}/test`, { method: 'GET' }, {
          maxAttempts: 3,
          initialDelayMs: 10,
          providerName: 'TestProvider',
        });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(AuthError);
      expect(thrown.name).toBe('AuthError');
      expect(callCount).toBe(1); // Did not retry
    } finally {
      server.stop(true);
    }
  });

  it('4. fetchWithRetry throws ContextLengthError on 400 context length message without retrying', async () => {
    let callCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        callCount++;
        return new Response(
          JSON.stringify({ error: { message: 'maximum context length is 8192 tokens. Your prompt exceeded it.' } }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    });

    try {
      let thrown: any = null;
      try {
        await fetchWithRetry(`${server.url}/test`, { method: 'GET' }, {
          maxAttempts: 3,
          initialDelayMs: 10,
          providerName: 'TestProvider',
        });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ContextLengthError);
      expect(thrown.name).toBe('ContextLengthError');
      expect(callCount).toBe(1); // Did not retry
    } finally {
      server.stop(true);
    }
  });

  it('5. fetchWithRetry retries on 500 and succeeds', async () => {
    let callCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        callCount++;
        if (callCount === 1) {
          return new Response('Internal Server Error', { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    try {
      const res = await fetchWithRetry(`${server.url}/test`, { method: 'GET' }, {
        initialDelayMs: 10,
        providerName: 'TestProvider',
      });
      expect(res.status).toBe(200);
      expect(callCount).toBe(2);
    } finally {
      server.stop(true);
    }
  });

  it('6. fetchWithRetry aborts mid-flight when signal is triggered', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const server = Bun.serve({
      port: 0,
      async fetch() {
        callCount++;
        // Simulate delayed response
        await Bun.sleep(200);
        return new Response(JSON.stringify({ ok: true }));
      },
    });

    try {
      const promise = fetchWithRetry(`${server.url}/test`, { method: 'GET' }, {
        signal: controller.signal,
        initialDelayMs: 10,
        providerName: 'TestProvider',
      });

      // Abort after 20ms
      setTimeout(() => controller.abort(), 20);

      let thrown: any = null;
      try {
        await promise;
      } catch (err) {
        thrown = err;
      }

      expect(thrown).not.toBeNull();
      expect(thrown.name === 'AbortError' || String(thrown).toLowerCase().includes('abort')).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  it('7. AnthropicProvider handles 429 retry and returns accurate token usage', async () => {
    let callCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: { type: 'rate_limit_error', message: 'Rate limit' } }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '0.01',
            },
          });
        }
        return new Response(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from Anthropic!' }],
            usage: {
              input_tokens: 42,
              output_tokens: 15,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    });

    try {
      const provider = new AnthropicProvider('test-key', server.url);
      const model = provider.getModel('claude-3-5-sonnet-20241022');
      const response = await model.generate({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(callCount).toBe(2);
      expect(response.text).toBe('Hello from Anthropic!');
      expect(response.usage).toEqual({
        inputTokens: 42,
        outputTokens: 15,
        totalTokens: 57,
      });
    } finally {
      server.stop(true);
    }
  });

  it('8. OpenAIProvider handles 429 retry and returns accurate token usage', async () => {
    let callCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        callCount++;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({ error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': '0.01',
              },
            }
          );
        }
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello from OpenAI!' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 25,
              total_tokens: 125,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    });

    try {
      const provider = new OpenAIProvider('test-key', server.url + '/v1');
      const model = provider.getModel('gpt-4o');
      const response = await model.generate({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(callCount).toBe(2);
      expect(response.text).toBe('Hello from OpenAI!');
      expect(response.usage).toEqual({
        inputTokens: 100,
        outputTokens: 25,
        totalTokens: 125,
      });
    } finally {
      server.stop(true);
    }
  });

  it('9. OpenAIProvider stream emits done event with accurate usage', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'
              )
            );
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[],"usage":{"prompt_tokens":55,"completion_tokens":12,"total_tokens":67}}\n\n'
              )
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        });
      },
    });

    try {
      const provider = new OpenAIProvider('test-key', server.url + '/v1');
      const model = provider.getModel('gpt-4o');
      const events: any[] = [];
      for await (const ev of model.stream!({ messages: [{ role: 'user', content: 'Hi' }] })) {
        events.push(ev);
      }

      const doneEv = events.find((e) => e.type === 'done');
      expect(doneEv).toBeDefined();
      expect(doneEv.usage).toEqual({
        inputTokens: 55,
        outputTokens: 12,
        totalTokens: 67,
      });
    } finally {
      server.stop(true);
    }
  });

  it('10. AnthropicProvider stream emits done event with accurate usage', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const lines = [
          'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","usage":{"input_tokens":75}}}\n\n',
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Anthropic response"}}\n\n',
          'data: {"type":"content_block_stop","index":0}\n\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}\n\n',
          'data: {"type":"message_stop"}\n\n',
        ];
        return new Response(lines.join(''), {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        });
      },
    });

    try {
      const provider = new AnthropicProvider('test-key', server.url);
      const model = provider.getModel('claude-3-5-sonnet-20241022');
      const events: any[] = [];
      for await (const ev of model.stream!({ messages: [{ role: 'user', content: 'Hi' }] })) {
        events.push(ev);
      }

      const doneEv = events.find((e) => e.type === 'done');
      expect(doneEv).toBeDefined();
      expect(doneEv.usage).toEqual({
        inputTokens: 75,
        outputTokens: 20,
        totalTokens: 95,
      });
    } finally {
      server.stop(true);
    }
  });

  it('11. model.generate aborts immediately when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(JSON.stringify({ text: 'should not get here' }));
      },
    });

    try {
      const provider = new AnthropicProvider('test-key', server.url);
      const model = provider.getModel('claude-3-5-sonnet-20241022');
      let thrown: any = null;
      try {
        await model.generate({
          messages: [{ role: 'user', content: 'Hi' }],
          signal: controller.signal,
        });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).not.toBeNull();
      expect(String(thrown).toLowerCase().includes('abort')).toBe(true);
    } finally {
      server.stop(true);
    }
  });
});
