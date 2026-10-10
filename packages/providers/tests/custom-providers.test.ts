import { describe, it, expect } from 'bun:test';
import { OpenAIProvider } from '../src/adapters/openai';
import { AnthropicProvider } from '../src/adapters/anthropic';
import { ModelCatalog } from '../src/catalog';

describe('Custom OpenAI and Anthropic Compatible Providers', () => {
  it('1. OpenAIProvider forwards custom baseUrl, apiKey, and custom headers', async () => {
    let capturedAuth: any = '';
    let capturedCustomHeader: any = '';
    let capturedPath: any = '';

    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        capturedPath = url.pathname;
        capturedAuth = req.headers.get('authorization');
        capturedCustomHeader = req.headers.get('x-custom-tenant');

        const body = (await req.json()) as any;
        expect(body.model).toBe('custom-llama-3');
        expect(body.messages[0].content).toBe('ping');

        return Response.json({
          id: 'chatcmpl-custom-1',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'pong from custom proxy',
              },
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 4,
            total_tokens: 9,
          },
        });
      },
    });

    try {
      const provider = new OpenAIProvider(
        'sk-custom-secret-key',
        `http://127.0.0.1:${server.port}/v1`,
        { 'x-custom-tenant': 'engineering-qa' },
        'my-custom-openai'
      );

      expect(provider.name).toBe('my-custom-openai');
      const model = provider.getModel('custom-llama-3');
      expect(model.id).toBe('custom-llama-3');

      const response = await model.generate({
        messages: [{ role: 'user', content: 'ping' }],
      });

      expect(response.text).toBe('pong from custom proxy');
      expect(response.usage?.totalTokens).toBe(9);
      expect(capturedPath).toBe('/v1/chat/completions');
      expect(capturedAuth).toBe('Bearer sk-custom-secret-key');
      expect(capturedCustomHeader).toBe('engineering-qa');
    } finally {
      server.stop();
    }
  });

  it('2. OpenAIProvider checkHealth handles custom proxies that return 404 or 405 on /models', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/v1/models') {
          // Minimal local proxy or vLLM single-instance without /models endpoint
          return new Response('Endpoint not found', { status: 404 });
        }
        return new Response('Not found', { status: 404 });
      },
    });

    try {
      const provider = new OpenAIProvider(
        'dummy-key',
        `http://127.0.0.1:${server.port}/v1`,
        undefined,
        'local-vllm'
      );

      const health = await provider.checkHealth();
      expect(health.ok).toBe(true);
    } finally {
      server.stop();
    }
  });

  it('3. AnthropicProvider forwards custom baseUrl, apiKey, and custom headers', async () => {
    let capturedApiKey: any = '';
    let capturedVersion: any = '';
    let capturedCustomRoute: any = '';
    let capturedPath: any = '';

    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        capturedPath = url.pathname;
        capturedApiKey = req.headers.get('x-api-key');
        capturedVersion = req.headers.get('anthropic-version');
        capturedCustomRoute = req.headers.get('x-gateway-routing');

        const body = (await req.json()) as any;
        expect(body.model).toBe('claude-custom-enterprise');
        expect(body.messages[0].content).toBe('hello claude');

        return Response.json({
          id: 'msg_custom_123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'hello from custom claude gateway',
            },
          ],
          usage: {
            input_tokens: 12,
            output_tokens: 8,
          },
        });
      },
    });

    try {
      const provider = new AnthropicProvider(
        'anthropic-custom-key',
        `http://127.0.0.1:${server.port}/anthropic`,
        { 'x-gateway-routing': 'us-east-cluster' },
        'my-anthropic-gateway'
      );

      expect(provider.name).toBe('my-anthropic-gateway');
      const model = provider.getModel('claude-custom-enterprise');
      expect(model.id).toBe('claude-custom-enterprise');

      const response = await model.generate({
        messages: [{ role: 'user', content: 'hello claude' }],
      });

      expect(response.text).toBe('hello from custom claude gateway');
      expect(response.usage?.inputTokens).toBe(12);
      expect(response.usage?.outputTokens).toBe(8);
      expect(capturedPath).toBe('/anthropic/v1/messages');
      expect(capturedApiKey).toBe('anthropic-custom-key');
      expect(capturedVersion).toBe('2023-06-01');
      expect(capturedCustomRoute).toBe('us-east-cluster');
    } finally {
      server.stop();
    }
  });

  it('4. AnthropicProvider checkHealth succeeds on custom base URL with 400 validation response', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.includes('/v1/messages')) {
          // Empty payload probe returns 400 or 401
          return Response.json({ error: { message: 'Invalid payload' } }, { status: 400 });
        }
        return new Response('Not found', { status: 404 });
      },
    });

    try {
      const provider = new AnthropicProvider(
        'test-key',
        `http://127.0.0.1:${server.port}`,
        undefined,
        'custom-claude'
      );

      const health = await provider.checkHealth();
      expect(health.ok).toBe(true);
    } finally {
      server.stop();
    }
  });

  it('5. ModelCatalog dynamically synthesizes specs for arbitrary custom models', () => {
    const catalog = new ModelCatalog();

    // Model from custom provider with prefix
    const customModel = catalog.getModelSpec('my-custom-proxy/qwen-2.5-coder-72b');
    expect(customModel).toBeDefined();
    expect(customModel?.id).toBe('my-custom-proxy/qwen-2.5-coder-72b');
    expect(customModel?.provider).toBe('my-custom-proxy');
    expect(customModel?.contextWindow).toBe(128_000);
    expect(customModel?.maxOutputTokens).toBe(8_192);
    expect(customModel?.supportsTools).toBe(true);
    expect(customModel?.supportsStreaming).toBe(true);

    // Bare model ID fallback
    const bareModel = catalog.getModelSpec('unknown-model-xyz');
    expect(bareModel).toBeDefined();
    expect(bareModel?.id).toBe('unknown-model-xyz');
    expect(bareModel?.provider).toBe('custom');
    expect(bareModel?.contextWindow).toBe(128_000);

    // Custom registration
    catalog.registerModelSpec({
      id: 'my-proxy/giant-model',
      provider: 'my-proxy',
      displayName: 'Giant Model 256k',
      contextWindow: 256_000,
      maxOutputTokens: 32_768,
      supportsTools: true,
      supportsStreaming: true,
    });

    const registered = catalog.getModelSpec('my-proxy/giant-model');
    expect(registered?.contextWindow).toBe(256_000);
    expect(registered?.maxOutputTokens).toBe(32_768);
  });
});
