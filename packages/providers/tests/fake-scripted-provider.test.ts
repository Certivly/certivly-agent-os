import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FakeScriptedModel, FakeScriptedProvider } from '../src/adapters/fake-scripted';

describe('Action 3.02: Fake Scripted Provider', () => {
  const tempScriptsDir = path.join(os.tmpdir(), 'temp-test-scripts-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tempScriptsDir, { recursive: true });
    const sampleScript = {
      taskId: 'test-task',
      turns: [
        {
          text: 'Turn 1 text',
          toolCalls: [
            {
              id: 'call-1',
              name: 'edit_file',
              args: { path: 'file.ts', oldText: 'a', newText: 'b' },
            },
          ],
        },
        {
          text: 'Final resolution text',
        },
      ],
    };
    fs.writeFileSync(
      path.join(tempScriptsDir, 'test-task.json'),
      JSON.stringify(sampleScript, null, 2)
    );
  });

  afterEach(() => {
    fs.rmSync(tempScriptsDir, { recursive: true, force: true });
  });

  it('1. fake provider loads a task script', async () => {
    const provider = new FakeScriptedProvider(tempScriptsDir);
    const model = provider.getModel('fake:scripted:test-task');

    const response = await model.generate({
      messages: [{ role: 'user', content: 'Please solve test-task' }],
    });

    expect(response.text).toBe('Turn 1 text');
    expect(response.toolCalls?.length).toBe(1);
    expect(response.toolCalls?.[0].name).toBe('edit_file');
  });

  it('2. missing script fails clearly', async () => {
    const provider = new FakeScriptedProvider(tempScriptsDir);
    const model = provider.getModel('fake:scripted:non-existent-task');

    expect(async () => {
      await model.generate({
        messages: [{ role: 'user', content: 'solve' }],
      });
    }).toThrow('Missing evaluation script for task "non-existent-task"');
  });

  it('3. fake provider emits tool call sequence then final text', async () => {
    const model = new FakeScriptedModel({
      taskId: 'test-task',
      scriptsDir: tempScriptsDir,
    });

    // Turn 1
    const res1 = await model.generate({
      messages: [{ role: 'user', content: 'task: test-task' }],
    });
    expect(res1.text).toBe('Turn 1 text');
    expect(res1.toolCalls?.[0].id).toBe('call-1');

    // Turn 2
    const res2 = await model.generate({
      messages: [
        { role: 'user', content: 'task: test-task' },
        { role: 'assistant', content: 'Turn 1 text' },
        { role: 'tool', content: 'success', toolCallId: 'call-1', name: 'calc' },
      ],
    });
    expect(res2.text).toBe('Final resolution text');
    expect(res2.toolCalls).toBeUndefined();
  });

  it('4. fake provider supports deterministic streaming', async () => {
    const model = new FakeScriptedModel({
      taskId: 'test-task',
      scriptsDir: tempScriptsDir,
    });

    const stream = model.generateStream!({
      messages: [{ role: 'user', content: 'task: test-task' }],
    });

    const chunks: any[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    const fullText = chunks.map((c) => c.delta).join('');
    expect(fullText).toBe('Turn 1 text');
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.toolCalls).toBeDefined();
    expect(lastChunk.toolCalls[0].name).toBe('edit_file');
  });
});
