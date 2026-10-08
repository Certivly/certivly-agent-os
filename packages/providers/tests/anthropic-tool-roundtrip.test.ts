import { describe, it, expect, afterEach } from 'bun:test';
import { AnthropicProvider } from '../src/adapters/anthropic';
import { createStrictAnthropicServer, type StrictAnthropicServerHandle } from './helpers/strictAnthropicServer';

describe('Anthropic Tool Round-Trip (Action 6-03)', () => {
  let server: StrictAnthropicServerHandle | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it('1. non-stream 2-turn tool conversation succeeds', async () => {
    server = createStrictAnthropicServer();
    const provider = new AnthropicProvider('test-key', server.url);
    const model = provider.getModel('claude-3-5-sonnet-20241022');

    // Turn 1
    const res1 = await model.generate({
      systemPrompt: 'You are a helpful assistant.',
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
      systemPrompt: 'You are a helpful assistant.',
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
    server = createStrictAnthropicServer();
    const provider = new AnthropicProvider('test-key', server.url);
    const model = provider.getModel('claude-3-5-sonnet-20241022');

    if (!model.stream) {
      throw new Error('model.stream not supported');
    }

    // Stream Turn 1
    const events1: any[] = [];
    for await (const ev of model.stream({
      systemPrompt: 'You are a helpful assistant.',
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
      systemPrompt: 'You are a helpful assistant.',
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
    server = createStrictAnthropicServer({ parallelToolCalls: true });
    const provider = new AnthropicProvider('test-key', server.url);
    const model = provider.getModel('claude-3-5-sonnet-20241022');

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
    server = createStrictAnthropicServer();
    const provider = new AnthropicProvider('test-key', server.url);
    const model = provider.getModel('claude-3-5-sonnet-20241022');

    await model.generate({
      messages: [{ role: 'user', content: 'read missing' }],
    });

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

  it('5. sending invalid shapes directly to the fake server returns 400', async () => {
    server = createStrictAnthropicServer();

    // Missing x-api-key
    const resp1 = await fetch(server.url + '/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-3', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(resp1.status).toBe(401);

    // Consecutive user messages
    const resp2 = await fetch(server.url + '/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'k' },
      body: JSON.stringify({
        model: 'claude-3',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'user', content: 'hello again' },
        ],
      }),
    });
    expect(resp2.status).toBe(400);
  });
});
