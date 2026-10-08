import { describe, it, expect } from 'bun:test';
import { ProviderDoctor } from '../src/doctor/ProviderDoctor';
import type { AgentConfig } from '@agent-os/config';

describe('Provider Doctor', () => {
  it('reports configured and unconfigured providers correctly without probe', async () => {
    const mockConfig: AgentConfig = {
      activeProvider: 'lmstudio',
      activeModel: 'local-model',
      evalModels: [],
      runtime: { logLevel: 'info', sessionDir: '.agentos/sessions' },
      agent: { selfReview: false, parallelExploration: false, planningMode: 'auto' },
      providers: {
        lmstudio: {
          baseUrl: 'http://localhost:1234/v1',
          model: 'qwen2.5-coder',
        },
        ollama: {
          baseUrl: 'http://localhost:11434',
          model: 'llama3.1',
        },
      },
    };

    const originalOpenAI = process.env.OPENAI_API_KEY;
    const originalAnthropic = process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const results = await ProviderDoctor.diagnose({
        config: mockConfig,
        probe: false,
      });

      const lm = results.find((r) => r.provider === 'lmstudio');
      const ol = results.find((r) => r.provider === 'ollama');
      const oa = results.find((r) => r.provider === 'openai');
      const an = results.find((r) => r.provider === 'anthropic');

      expect(lm?.configured).toBe(true);
      expect(lm?.probeStatus).toBe('skipped');
      expect(ol?.configured).toBe(true);
      expect(ol?.probeStatus).toBe('skipped');

      expect(oa?.configured).toBe(false);
      expect(an?.configured).toBe(false);

      const report = ProviderDoctor.formatReport(results, false);
      expect(report).toContain('lmstudio');
      expect(report).toContain('[configured]');
      expect(report).toContain('openai');
      expect(report).toContain('[unconfigured]');
    } finally {
      if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
      if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
    }
  });

  it('probes reachable and unreachable providers with --probe', async () => {
    // Start a fake server for LM Studio
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/v1/models') {
          return Response.json({
            data: [{ id: 'mock-local-model' }],
          });
        }
        return new Response('Not found', { status: 404 });
      },
    });

    try {
      const mockConfig: AgentConfig = {
        activeProvider: 'lmstudio',
        activeModel: 'mock-local-model',
        evalModels: [],
        runtime: { logLevel: 'info', sessionDir: '.agentos/sessions' },
        agent: { selfReview: false, parallelExploration: false, planningMode: 'auto' },
        providers: {
          lmstudio: {
            baseUrl: `http://127.0.0.1:${server.port}/v1`,
            model: 'mock-local-model',
          },
          ollama: {
            // Unreachable port
            baseUrl: 'http://127.0.0.1:59997',
            model: 'qwen',
          },
        },
      };

      const results = await ProviderDoctor.diagnose({
        config: mockConfig,
        probe: true,
      });

      const lm = results.find((r) => r.provider === 'lmstudio');
      const ol = results.find((r) => r.provider === 'ollama');

      expect(lm?.probeStatus).toBe('ok');
      expect(ol?.probeStatus).toBe('failed');
      expect(ol?.error).toContain('unreachable');

      const report = ProviderDoctor.formatReport(results, true);
      expect(report).toContain('probe: OK (reachable)');
      expect(report).toContain('probe: FAILED');
    } finally {
      server.stop();
    }
  });
});
