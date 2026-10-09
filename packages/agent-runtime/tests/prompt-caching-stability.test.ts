import { describe, it, expect } from 'bun:test';
import { ContextAssembler, ContextSnapshot } from '../src/loop/ContextAssembler';
import type { LoopState } from '../src/loop/types';
import { AnthropicModel } from '@agent-os/providers';

describe('Prompt Caching & Context Stability (Phase 1)', () => {
  it('maintains 100% byte-identical static system prompt prefix across varying turns', () => {
    const staticBasePrompt = 'You are AgentOS. Follow instructions strictly.\n## Base Rules\n1. Do not break tests.';

    const loopStateTurn1: LoopState = {
      filesRead: new Set(['src/index.ts']),
      filesEdited: new Set(),
      pipelineCompleted: ['explore'],
      verificationAttempts: 0,
      loadedInstructionDirs: new Set(),
    };

    const snapshot1 = ContextAssembler.build(loopStateTurn1, {
      userInput: 'Implement feature X',
      permissionMode: 'auto',
      verificationPassed: true,
    });

    const turn1Prompt = ContextAssembler.buildTurnSystemPrompt(staticBasePrompt, snapshot1);

    const loopStateTurn2: LoopState = {
      filesRead: new Set(['src/index.ts', 'src/auth.ts']),
      filesEdited: new Set(['src/auth.ts']),
      pipelineCompleted: ['explore', 'edit'],
      verificationAttempts: 1,
      lastVerificationOutput: 'SyntaxError: Unexpected token in auth.ts',
      loadedInstructionDirs: new Set(),
    };

    const snapshot2 = ContextAssembler.build(loopStateTurn2, {
      userInput: 'Implement feature X',
      permissionMode: 'auto',
      verificationPassed: false,
    });

    const turn2Prompt = ContextAssembler.buildTurnSystemPrompt(staticBasePrompt, snapshot2);

    // Verify both turn prompts start with the exact staticBasePrompt prefix
    expect(turn1Prompt.startsWith(staticBasePrompt)).toBe(true);
    expect(turn2Prompt.startsWith(staticBasePrompt)).toBe(true);

    // Turn 1 should not contain verification error
    expect(turn1Prompt).not.toContain('SyntaxError');

    // Turn 2 should contain dynamic failure in the suffix without altering the leading prefix
    expect(turn2Prompt).toContain('SyntaxError: Unexpected token in auth.ts');

    // Longest common prefix must equal the staticBasePrompt
    expect(turn1Prompt.slice(0, staticBasePrompt.length)).toBe(staticBasePrompt);
    expect(turn2Prompt.slice(0, staticBasePrompt.length)).toBe(staticBasePrompt);
  });

  it('Anthropic adapter injects cache_control block when systemPromptCacheControl is set', async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body || '{}'));
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'OK' }],
          usage: {
            input_tokens: 1500,
            output_tokens: 50,
            cache_read_input_tokens: 1200,
            cache_creation_input_tokens: 300,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as any;

    try {
      const model = new AnthropicModel('claude-3-5-sonnet-20241022', 'test-key');
      const response = await model.generate({
        systemPrompt: 'System instructions',
        systemPromptCacheControl: { type: 'ephemeral' },
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(capturedBody).not.toBeNull();
      expect(Array.isArray(capturedBody.system)).toBe(true);
      expect(capturedBody.system[0]).toEqual({
        type: 'text',
        text: 'System instructions',
        cache_control: { type: 'ephemeral' },
      });

      expect(response.usage?.cacheReadInputTokens).toBe(1200);
      expect(response.usage?.cacheCreationInputTokens).toBe(300);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
