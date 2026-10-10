import * as fs from 'fs';
import * as path from 'path';
import { ModelCatalog, type ModelSpec } from '@agent-os/providers';
import { ConfigManager } from '@agent-os/config';

export interface ProviderInfo {
  id: string;
  name: string;
  envVar: string;
  isConfigured: boolean;
  defaultBaseUrl?: string;
}

export class ModelsCommand {
  private catalog: ModelCatalog;

  constructor() {
    this.catalog = new ModelCatalog();
  }

  public getProviders(): ProviderInfo[] {
    return [
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        envVar: 'ANTHROPIC_API_KEY',
        isConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      },
      {
        id: 'openai',
        name: 'OpenAI GPT',
        envVar: 'OPENAI_API_KEY',
        isConfigured: Boolean(process.env.OPENAI_API_KEY),
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        envVar: 'DEEPSEEK_API_KEY',
        isConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      },
      {
        id: 'gemini',
        name: 'Google Gemini',
        envVar: 'GEMINI_API_KEY',
        isConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      },
      {
        id: 'qwen',
        name: 'Qwen / DashScope',
        envVar: 'DASHSCOPE_API_KEY',
        isConfigured: Boolean(process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY),
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        envVar: 'OPENROUTER_API_KEY',
        isConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      },
      {
        id: 'ollama',
        name: 'Ollama (Local)',
        envVar: 'OLLAMA_BASE_URL',
        isConfigured: true,
        defaultBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      },
      {
        id: 'lmstudio',
        name: 'LM Studio (Local)',
        envVar: 'LMSTUDIO_BASE_URL',
        isConfigured: true,
        defaultBaseUrl: 'http://127.0.0.1:1234/v1',
      },
    ];
  }

  public listModels(providerFilter?: string): { models: ModelSpec[]; activeModel: string } {
    const configManager = new ConfigManager({ workspaceRoot: process.cwd() });
    const config = configManager.load();
    const activeModel = config.activeModel || 'claude-3-5-sonnet';
    const models = this.catalog.listModels(providerFilter);
    return { models, activeModel };
  }

  public inferProvider(modelId: string): string {
    const spec = this.catalog.getModelSpec(modelId);
    if (spec && spec.provider !== 'custom') return spec.provider;

    const lower = modelId.toLowerCase();
    if (lower.startsWith('claude')) return 'anthropic';
    if (lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3')) return 'openai';
    if (lower.startsWith('deepseek')) return 'deepseek';
    if (lower.startsWith('gemini')) return 'gemini';
    if (lower.startsWith('qwen')) return 'ollama';
    if (lower.startsWith('fake:') || lower === 'scripted') return 'fake';
    if (lower.includes('/')) return 'openrouter';
    return 'custom';
  }

  public setModel(modelId: string): { success: boolean; activeModel: string; activeProvider: string; configPath: string } {
    const provider = this.inferProvider(modelId);

    const projectConfig = ConfigManager.findProjectConfigPath(process.cwd());
    const targetConfigPath = projectConfig || ConfigManager.getUserConfigPath();

    let existing: any = {};
    if (fs.existsSync(targetConfigPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(targetConfigPath, 'utf-8'));
      } catch (_err) {
        existing = {};
      }
    }

    existing.activeModel = modelId;
    existing.activeProvider = provider;
    if (!existing.agent) existing.agent = {};
    if (!existing.agent.modelRoles) existing.agent.modelRoles = {};
    existing.agent.modelRoles.primary = modelId;

    fs.mkdirSync(path.dirname(targetConfigPath), { recursive: true });
    fs.writeFileSync(targetConfigPath, JSON.stringify(existing, null, 2), 'utf-8');

    return {
      success: true,
      activeModel: modelId,
      activeProvider: provider,
      configPath: targetConfigPath,
    };
  }

  public testModel(modelId: string): { success: boolean; message: string; spec?: ModelSpec } {
    const spec = this.catalog.getModelSpec(modelId);
    if (!spec) {
      return { success: false, message: `Model "${modelId}" not found in catalog.` };
    }

    const providerId = this.inferProvider(modelId);
    const providers = this.getProviders();
    const provider = providers.find(p => p.id === providerId);

    if (spec.provider === 'fake' || providerId === 'fake') {
      return { success: true, message: `Mock/fake model "${modelId}" (${spec.displayName}) is always available.`, spec };
    }

    if (spec.provider === 'ollama' || spec.provider === 'lmstudio') {
      return { success: true, message: `Local provider "${spec.provider}" configured at ${provider?.defaultBaseUrl}.`, spec };
    }

    if (provider && !provider.isConfigured) {
      return {
        success: false,
        message: `Provider "${provider.name}" requires ${provider.envVar} to be set. Run "agentos login ${provider.id}" or export ${provider.envVar}.`,
        spec,
      };
    }

    return {
      success: true,
      message: `Provider "${provider?.name || spec.provider}" is configured and ready for model "${modelId}".`,
      spec,
    };
  }
}
