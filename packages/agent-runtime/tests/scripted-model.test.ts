import { describe, it, expect } from 'bun:test';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('ScriptedModel', () => {
  it('should return the first scripted response and record the request', async () => {
    const model = new ScriptedModel([
      {
        text: 'I will read the file',
        toolCalls: [{ id: 'call_1', name: 'read_file', arguments: { path: 'src/foo.ts' } }],
      },
      {
        text: 'The file exports foo().',
      },
    ]);

    const req1 = { messages: [{ role: 'user' as const, content: 'What does foo export?' }] };
    const res1 = await model.generate(req1);

    expect(res1.text).toBe('I will read the file');
    expect(res1.toolCalls).toHaveLength(1);
    expect(res1.toolCalls![0].name).toBe('read_file');
    expect(JSON.parse(res1.toolCalls![0].args)).toEqual({ path: 'src/foo.ts' });

    expect(model.callCount).toBe(1);
    expect(model.lastRequest).toEqual(req1);

    const req2 = { messages: [{ role: 'user' as const, content: 'Next step' }] };
    const res2 = await model.generate(req2);
    expect(res2.text).toBe('The file exports foo().');
    expect(res2.toolCalls).toBeUndefined();
    expect(model.callCount).toBe(2);
  });

  it('should throw after responses are exhausted', async () => {
    const model = new ScriptedModel([{ text: 'Only one' }]);
    await model.generate({ messages: [{ role: 'user', content: '1' }] });

    expect(model.generate({ messages: [{ role: 'user', content: '2' }] })).rejects.toThrow(
      /ScriptedModel exhausted/
    );
  });

  it('should yield streaming text chunks in order', async () => {
    const model = new ScriptedModel([{ text: 'Hello world from streaming model' }]);

    const chunks: string[] = [];
    for await (const chunk of model.generateStream({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello world from streaming model');
    expect(model.callCount).toBe(1);
  });
});
