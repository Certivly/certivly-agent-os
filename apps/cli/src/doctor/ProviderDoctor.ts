import { ConfigManager } from '@agent-os/config';
import type { AgentConfig } from '@agent-os/config';
import {
  OpenAIProvider,
  AnthropicProvider,
  LMStudioProvider,
  OllamaProvider,
  GeminiProvider,
  DeepSeekProvider,
} from '@agent-os/providers';
import * as path from 'path';

export interface ProviderDoctorStatus {
  provider: string;
  configured: boolean;
  model?: string;
  baseUrl?: string;
  probeStatus?: 'ok' | 'failed' | 'skipped';
  error?: string;
}

export class ProviderDoctor {
  static async diagnose(options?: {
    probe?: boolean;
    configPath?: string;
    config?: AgentConfig;
  }): Promise<ProviderDoctorStatus[]> {
    const probe = !!options?.probe;
    let config: AgentConfig;

    if (options?.config) {
      config = options.config;
    } else {
      const cfgPath =
        options?.configPath ||
        path.join(process.cwd(), '.agentos', 'config.json');
      const manager = new ConfigManager(cfgPath);
      config = manager.getConfig();
    }

    const results: ProviderDoctorStatus[] = [];

    // 1. OpenAI
    const openAIKey =
      config.providers?.openai?.apiKey || process.env.OPENAI_API_KEY;
    const openAIBaseUrl = config.providers?.openai?.baseUrl;
    const openAIModel = config.providers?.openai?.model || 'gpt-4o';
    const openAIConfigured = !!openAIKey;

    let openAIProbe: 'ok' | 'failed' | 'skipped' = 'skipped';
    let openAIError: string | undefined;

    if (probe && openAIConfigured) {
      try {
        const p = new OpenAIProvider(openAIKey, openAIBaseUrl);
        const health = await p.checkHealth();
        if (health.ok) {
          openAIProbe = 'ok';
        } else {
          openAIProbe = 'failed';
          openAIError = health.error;
        }
      } catch (err: any) {
        openAIProbe = 'failed';
        openAIError = err.message;
      }
    }

    results.push({
      provider: 'openai',
      configured: openAIConfigured,
      model: openAIModel,
      baseUrl: openAIBaseUrl,
      probeStatus: openAIProbe,
      error: openAIError,
    });

    // 2. Anthropic
    const anthropicKey =
      config.providers?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY;
    const anthropicModel =
      config.providers?.anthropic?.model || 'claude-3-5-sonnet-20241022';
    const anthropicConfigured = !!anthropicKey;

    let anthropicProbe: 'ok' | 'failed' | 'skipped' = 'skipped';
    let anthropicError: string | undefined;

    if (probe && anthropicConfigured) {
      try {
        const p = new AnthropicProvider(anthropicKey);
        const health = await p.checkHealth();
        if (health.ok) {
          anthropicProbe = 'ok';
        } else {
          anthropicProbe = 'failed';
          anthropicError = health.error;
        }
      } catch (err: any) {
        anthropicProbe = 'failed';
        anthropicError = err.message;
      }
    }

    results.push({
      provider: 'anthropic',
      configured: anthropicConfigured,
      model: anthropicModel,
      probeStatus: anthropicProbe,
      error: anthropicError,
    });

    // 3. LM Studio
    const lmstudioConfig = config.providers?.lmstudio;
    const lmstudioBaseUrl =
      lmstudioConfig?.baseUrl ||
      (config.activeProvider === 'lmstudio' ? 'http://localhost:1234/v1' : undefined);
    const lmstudioModel =
      lmstudioConfig?.model || (config.activeProvider === 'lmstudio' ? config.activeModel : undefined);
    const lmstudioConfigured = !!lmstudioConfig || config.activeProvider === 'lmstudio';

    let lmstudioProbe: 'ok' | 'failed' | 'skipped' = 'skipped';
    let lmstudioError: string | undefined;

    if (probe && lmstudioConfigured) {
      try {
        const p = new LMStudioProvider(lmstudioConfig?.apiKey, lmstudioBaseUrl);
        const health = await p.checkHealth();
        if (health.ok) {
          lmstudioProbe = 'ok';
        } else {
          lmstudioProbe = 'failed';
          lmstudioError = health.error;
        }
      } catch (err: any) {
        lmstudioProbe = 'failed';
        lmstudioError = err.message;
      }
    }

    results.push({
      provider: 'lmstudio',
      configured: lmstudioConfigured,
      model: lmstudioModel,
      baseUrl: lmstudioBaseUrl,
      probeStatus: lmstudioProbe,
      error: lmstudioError,
    });

    // 4. Ollama
    const ollamaConfig = config.providers?.ollama;
    const ollamaBaseUrl =
      ollamaConfig?.baseUrl ||
      (config.activeProvider === 'ollama' ? 'http://localhost:11434' : undefined);
    const ollamaModel =
      ollamaConfig?.model || (config.activeProvider === 'ollama' ? config.activeModel : undefined);
    const ollamaConfigured = !!ollamaConfig || config.activeProvider === 'ollama';

    let ollamaProbe: 'ok' | 'failed' | 'skipped' = 'skipped';
    let ollamaError: string | undefined;

    if (probe && ollamaConfigured) {
      try {
        const p = new OllamaProvider(ollamaBaseUrl);
        const health = await p.checkHealth();
        if (health.ok) {
          ollamaProbe = 'ok';
        } else {
          ollamaProbe = 'failed';
          ollamaError = health.error;
        }
      } catch (err: any) {
        ollamaProbe = 'failed';
        ollamaError = err.message;
      }
    }

    results.push({
      provider: 'ollama',
      configured: ollamaConfigured,
      model: ollamaModel,
      baseUrl: ollamaBaseUrl,
      probeStatus: ollamaProbe,
      error: ollamaError,
    });

    // 5. Gemini
    const geminiKey =
      config.providers?.gemini?.apiKey || process.env.GEMINI_API_KEY;
    const geminiBaseUrl = config.providers?.gemini?.baseUrl;
    const geminiModel = config.providers?.gemini?.model || 'gemini-2.0-flash';
    const geminiConfigured = !!geminiKey;

    let geminiProbe: 'ok' | 'failed' | 'skipped' = 'skipped';
    let geminiError: string | undefined;

    if (probe && geminiConfigured) {
      try {
        const p = new GeminiProvider(geminiKey, geminiBaseUrl);
        const health = await p.checkHealth();
        if (health.ok) {
          geminiProbe = 'ok';
        } else {
          geminiProbe = 'failed';
          geminiError = health.error;
        }
      } catch (err: any) {
        geminiProbe = 'failed';
        geminiError = err.message;
      }
    }

    results.push({
      provider: 'gemini',
      configured: geminiConfigured,
      model: geminiModel,
      baseUrl: geminiBaseUrl,
      probeStatus: geminiProbe,
      error: geminiError,
    });

    // 6. DeepSeek
    const deepseekKey =
      config.providers?.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY;
    const deepseekBaseUrl = config.providers?.deepseek?.baseUrl;
    const deepseekModel = config.providers?.deepseek?.model || 'deepseek-chat';
    const deepseekConfigured = !!deepseekKey;

    let deepseekProbe: 'ok' | 'failed' | 'skipped' = 'skipped';
    let deepseekError: string | undefined;

    if (probe && deepseekConfigured) {
      try {
        const p = new DeepSeekProvider(deepseekKey, deepseekBaseUrl);
        const health = await p.checkHealth();
        if (health.ok) {
          deepseekProbe = 'ok';
        } else {
          deepseekProbe = 'failed';
          deepseekError = health.error;
        }
      } catch (err: any) {
        deepseekProbe = 'failed';
        deepseekError = err.message;
      }
    }

    results.push({
      provider: 'deepseek',
      configured: deepseekConfigured,
      model: deepseekModel,
      baseUrl: deepseekBaseUrl,
      probeStatus: deepseekProbe,
      error: deepseekError,
    });

    return results;
  }

  static formatReport(
    statuses: ProviderDoctorStatus[],
    probed: boolean = false
  ): string {
    const lines: string[] = ['Provider Health & Diagnostics:'];
    for (const s of statuses) {
      const configStr = s.configured ? '[configured]' : '[unconfigured]';
      let line = `  - ${s.provider.padEnd(10)}: ${configStr}`;
      if (s.model) line += ` (model: ${s.model})`;
      if (s.baseUrl) line += ` @ ${s.baseUrl}`;

      if (probed && s.configured) {
        if (s.probeStatus === 'ok') {
          line += ' -> probe: OK (reachable)';
        } else if (s.probeStatus === 'failed') {
          line += ` -> probe: FAILED (${s.error || 'unreachable'})`;
        }
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
}
