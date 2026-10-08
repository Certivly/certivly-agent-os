import { describe, it, expect } from 'bun:test';
import { OllamaProvider, OllamaModel } from '../src/adapters/ollama';

describe('Ollama Local Provider', () => {
  it('3. Ollama generate works', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/chat') {
          const body = (await req.json()) as any;
          expect(body.model).toBe('qwen2.5-coder');
          expect(body.messages[0].content).toBe('ping');

          return Response.json({
            model: 'qwen2.5-coder',
            message: {
              role: 'assistant',
              content: 'pong',
            },
            prompt_eval_count: 8,
            eval_count: 4,
          });
        }
        return new Response('Not found', { status: 404 });
      },
    });

    try {
      const provider = new OllamaProvider(`http://127.0.0.1:${server.port}`);
      const model = provider.getModel('qwen2.5-coder');

      const response = await model.generate({
        messages: [{ role: 'user', content: 'ping' }],
      });

      expect(response.text).toBe('pong');
      expect(response.usage?.totalTokens).toBe(12);
    } finally {
      server.stop();
    }
  });

  it('4. unsupported Ollama tool call errors clearly', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/chat') {
          return new Response('model "deepseek-coder:1.3b" does not support tools', {
            status: 400,
          });
        }
        return new Response('Not found', { status: 404 });
      },
    });

    try {
      const provider = new OllamaProvider(`http://127.0.0.1:${server.port}`);
      const model = provider.getModel('deepseek-coder:1.3b');

      expect(
        model.generate({
          messages: [{ role: 'user', content: 'use a tool' }],
          tools: [
            {
              name: 'edit_file',
              description: 'Edit a file',
              parameters: { type: 'object', properties: {} },
            },
          ],
        })
      ).rejects.toThrow(
        'Ollama model "deepseek-coder:1.3b" does not support tool calling'
      );
    } finally {
      server.stop();
    }
  });

  it('Ollama tool call works when model supports tools', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/chat') {
          return Response.json({
            model: 'qwen2.5-coder',
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  function: {
                    name: 'edit_file',
                    arguments: { path: 'a.txt', content: 'hi' },
                  },
                },
              ],
            },
          });
        }
        return new Response('Not found', { status: 404 });
      },
    });

    try {
      const provider = new OllamaProvider(`http://127.0.0.1:${server.port}`);
      const model = provider.getModel('qwen2.5-coder');

      const response = await model.generate({
        messages: [{ role: 'user', content: 'write a file' }],
        tools: [
          {
            name: 'edit_file',
            description: 'Edit a file',
            parameters: { type: 'object', properties: {} },
          },
        ],
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.[0].name).toBe('edit_file');
      expect(JSON.parse(response.toolCalls?.[0].args!)).toEqual({
        path: 'a.txt',
        content: 'hi',
      });
    } finally {
      server.stop();
    }
  });

  it('reports clear error when Ollama server is unreachable', async () => {
    const provider = new OllamaProvider('http://127.0.0.1:59998');
    const model = provider.getModel('qwen2.5-coder');

    expect(
      model.generate({
        messages: [{ role: 'user', content: 'hi' }],
      })
    ).rejects.toThrow('Ollama unreachable at http://127.0.0.1:59998');
  });
});
