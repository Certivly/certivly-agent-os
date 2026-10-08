import { describe, it, expect, afterEach } from 'bun:test';
import { OpenAIProvider } from '../src/adapters/openai';
import { LMStudioProvider } from '../src/adapters/lmstudio';
import { DeepSeekProvider } from '../src/adapters/deepseek';
import { createStrictOpenAIServer, type StrictServerHandle } from './helpers/strictOpenAIServer';
import type { Provider } from '../src/interface';

describe('OpenAI-Compatible Tool Round-Trip (Action 6-02)', () => {
  let server: StrictServerHandle | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  const providersToTest: Array<{
    name: string;
    createProvider: (url: string) => Provider;
    modelId: string;
  }> = [
    {
      name: 'OpenAI',
      createProvider: (url) => new OpenAIProvider('test-key', url),
      modelId: 'gpt-4o',
    },
    {
      name: 'LMStudio',
      createProvider: (url) => new LMStudioProvider('lm-studio', url),
      modelId: 'local-model',
    },
    {
      name: 'DeepSeek',
      createProvider: (url) => new DeepSeekProvider('test-key', url),
      modelId: 'deepseek-chat',
    },
  ];

  for (const p of providersToTest) {
    describe(`Provider: ${p.name}`, () => {
      it('1. non-stream 2-turn tool conversation succeeds', async () => {
        server = createStrictOpenAIServer();
        const provider = p.createProvider(server.url + '/v1');
        const model = provider.getModel(p.modelId);

        // Turn 1
        const res1 = await model.generate({
          systemPrompt: 'You are a helper.',
          messages: [{ role: 'user', content: 'read a.ts' }],
          tools: [{ name: 'read_file', description: 'read file', parameters: { type: 'object' } }],
        });

        expect(res1.toolCalls).toBeDefined();
        expect(res1.toolCalls?.length).toBe(1);
        expect(res1.toolCalls?.[0].id).toBe('call_1');
        expect(res1.toolCalls?.[0].name).toBe('read_file');
        expect(res1.toolCalls?.[0].args).toBe(JSON.stringify({ path: 'a.ts' }));

        // Turn 2
        const res2 = await model.generate({
          systemPrompt: 'You are a helper.',
          messages: [
            { role: 'user', content: 'read a.ts' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 'call_1', name: 'read_file', args: res1.toolCalls![0].args }],
            },
            {
              role: 'tool',
              toolCallId: 'call_1',
              name: 'read_file',
              content: 'file contents of a.ts',
            },
          ],
        });

        expect(res2.text).toBe('Completed reading files.');
        expect(res2.toolCalls).toBeUndefined();
      });

      it('2. stream 2-turn conversation succeeds, tool args reassembled from split chunks', async () => {
        server = createStrictOpenAIServer();
        const provider = p.createProvider(server.url + '/v1');
        const model = provider.getModel(p.modelId);

        if (!model.stream) {
          throw new Error('model.stream not supported');
        }

        // Stream Turn 1
        const events1: any[] = [];
        for await (const ev of model.stream({
          systemPrompt: 'You are a helper.',
          messages: [{ role: 'user', content: 'read a.ts' }],
          tools: [{ name: 'read_file', description: 'read file' }],
        })) {
          events1.push(ev);
        }

        const startEvent = events1.find((e) => e.type === 'tool_call_start');
        expect(startEvent).toBeDefined();
        expect(startEvent.id).toBe('call_1');
        expect(startEvent.name).toBe('read_file');

        const endEvent = events1.find((e) => e.type === 'tool_call_end');
        expect(endEvent).toBeDefined();
        expect(endEvent.arguments).toEqual({ path: 'a.ts' });

        // Stream Turn 2
        const events2: any[] = [];
        for await (const ev of model.stream({
          systemPrompt: 'You are a helper.',
          messages: [
            { role: 'user', content: 'read a.ts' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 'call_1', name: 'read_file', args: JSON.stringify({ path: 'a.ts' }) }],
            },
            {
              role: 'tool',
              toolCallId: 'call_1',
              name: 'read_file',
              content: 'contents',
            },
          ],
        })) {
          events2.push(ev);
        }

        const textEvents = events2.filter((e) => e.type === 'text_delta');
        const fullText = textEvents.map((e) => e.text).join('');
        expect(fullText).toBe('Completed reading files.');
      });

      it('3. two parallel tool calls in one assistant message succeed', async () => {
        server = createStrictOpenAIServer({ parallelToolCalls: true });
        const provider = p.createProvider(server.url + '/v1');
        const model = provider.getModel(p.modelId);

        // Turn 1 returns 2 tool calls
        const res1 = await model.generate({
          messages: [{ role: 'user', content: 'read two files' }],
        });

        expect(res1.toolCalls?.length).toBe(2);
        expect(res1.toolCalls?.[0].id).toBe('call_1');
        expect(res1.toolCalls?.[1].id).toBe('call_2');

        // Turn 2 answers BOTH
        const res2 = await model.generate({
          messages: [
            { role: 'user', content: 'read two files' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [
                { id: 'call_1', name: 'read_file', args: res1.toolCalls![0].args },
                { id: 'call_2', name: 'read_file', args: res1.toolCalls![1].args },
              ],
            },
            { role: 'tool', toolCallId: 'call_1', name: 'read_file', content: 'content of a.ts' },
            { role: 'tool', toolCallId: 'call_2', name: 'read_file', content: 'content of b.ts' },
          ],
        });

        expect(res2.text).toBe('Completed reading files.');
      });

      it('4. tool result with isError: true is accepted', async () => {
        server = createStrictOpenAIServer();
        const provider = p.createProvider(server.url + '/v1');
        const model = provider.getModel(p.modelId);

        // Turn 1
        await model.generate({
          messages: [{ role: 'user', content: 'read missing' }],
        });

        // Turn 2 with isError: true
        const res2 = await model.generate({
          messages: [
            { role: 'user', content: 'read missing' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 'call_1', name: 'read_file', args: '{"path":"missing.ts"}' }],
            },
            {
              role: 'tool',
              toolCallId: 'call_1',
              name: 'read_file',
              content: 'File not found',
              isError: true,
            },
          ],
        });

        expect(res2.text).toBe('Completed reading files.');
      });
    });
  }

  it('5. sending the OLD invalid shape directly to the fake server returns 400 (proves the server is strict)', async () => {
    server = createStrictOpenAIServer();

    // Old shape: tool without preceding assistant tool_calls
    const resp1 = await fetch(server.url + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'tool', content: 'orphan tool result', name: 'read_file' },
        ],
      }),
    });
    expect(resp1.status).toBe(400);

    // Old shape: assistant with tool_calls followed by user without answering tool_calls
    const resp2 = await fetch(server.url + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'f', arguments: '{}' } }],
          },
          { role: 'user', content: 'skipping tool answer' },
        ],
      }),
    });
    expect(resp2.status).toBe(400);
  });
});
