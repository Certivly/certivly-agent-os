import { describe, it, expect } from 'bun:test';
import { LMStudioProvider, LMStudioModel } from '../src/adapters/lmstudio';

describe('LM Studio Local Provider', () => {
  it('1. LM Studio generate works', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = (await req.json()) as any;
        expect(body.model).toBe('local-model');
        expect(body.messages[0].content).toBe('Hello from test');

        return Response.json({
          id: 'chatcmpl-123',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Hello! I am local LM Studio.',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 6,
            total_tokens: 16,
          },
        });
      },
    });

    try {
      const provider = new LMStudioProvider(
        'lm-studio',
        `http://127.0.0.1:${server.port}/v1`
      );
      const model = provider.getModel('local-model');

      const response = await model.generate({
        messages: [{ role: 'user', content: 'Hello from test' }],
      });

      expect(response.text).toBe('Hello! I am local LM Studio.');
      expect(response.usage?.totalTokens).toBe(16);
      expect(response.toolCalls).toBeUndefined();
    } finally {
      server.stop();
    }
  });

  it('2. LM Studio tool call works', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = (await req.json()) as any;
        expect(body.tools).toBeDefined();
        expect(body.tools[0].function.name).toBe('read_file');

        return Response.json({
          id: 'chatcmpl-tool',
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_lm_1',
                    type: 'function',
                    function: {
                      name: 'read_file',
                      arguments: '{"path":"README.md"}',
                    },
                  },
                ],
              },
            },
          ],
        });
      },
    });

    try {
      const provider = new LMStudioProvider(
        'lm-studio',
        `http://127.0.0.1:${server.port}/v1`
      );
      const model = provider.getModel('local-model');

      const response = await model.generate({
        messages: [{ role: 'user', content: 'Read README.md' }],
        tools: [
          {
            name: 'read_file',
            description: 'Read file contents',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
        ],
      });

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0].name).toBe('read_file');
      expect(response.toolCalls?.[0].args).toBe('{"path":"README.md"}');
    } finally {
      server.stop();
    }
  });

  it('reports clear error when server is unreachable', async () => {
    // Pick an unused port
    const provider = new LMStudioProvider(
      'lm-studio',
      'http://127.0.0.1:59999/v1'
    );
    const model = provider.getModel('local-model');

    expect(
      model.generate({
        messages: [{ role: 'user', content: 'hi' }],
      })
    ).rejects.toThrow('LM Studio unreachable at http://127.0.0.1:59999/v1');
  });
});
