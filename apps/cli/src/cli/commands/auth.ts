import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '@agent-os/config';

export interface AuthStatusEntry {
  provider: string;
  name: string;
  envVar: string;
  source: 'env' | 'config' | 'none';
  maskedKey: string;
  isConfigured: boolean;
}

export class AuthCommand {
  private getUserConfigPath(): string {
    return ConfigManager.getUserConfigPath();
  }

  private loadUserConfig(): any {
    const configPath = this.getUserConfigPath();
    if (fs.existsSync(configPath)) {
      try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (_err) {
        return {};
      }
    }
    return {};
  }

  private saveUserConfig(config: any): void {
    const configPath = this.getUserConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private mask(key: string): string {
    if (!key || key.length < 8) return '****';
    return `${key.slice(0, 7)}...${key.slice(-4)}`;
  }

  public getStatus(): AuthStatusEntry[] {
    const userConfig = this.loadUserConfig();
    const providers = userConfig.providers || {};

    const definitions = [
      { id: 'anthropic', name: 'Anthropic Claude', envVar: 'ANTHROPIC_API_KEY' },
      { id: 'openai', name: 'OpenAI GPT', envVar: 'OPENAI_API_KEY' },
      { id: 'deepseek', name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY' },
      { id: 'gemini', name: 'Google Gemini', envVar: 'GEMINI_API_KEY' },
      { id: 'qwen', name: 'Qwen / DashScope', envVar: 'DASHSCOPE_API_KEY' },
      { id: 'openrouter', name: 'OpenRouter', envVar: 'OPENROUTER_API_KEY' },
    ];

    return definitions.map(def => {
      const envVal = process.env[def.envVar] || (def.id === 'gemini' ? process.env.GOOGLE_API_KEY : undefined);
      const configVal = providers[def.id]?.apiKey;

      if (envVal) {
        return {
          provider: def.id,
          name: def.name,
          envVar: def.envVar,
          source: 'env',
          maskedKey: this.mask(envVal),
          isConfigured: true,
        };
      }

      if (configVal) {
        return {
          provider: def.id,
          name: def.name,
          envVar: def.envVar,
          source: 'config',
          maskedKey: this.mask(configVal),
          isConfigured: true,
        };
      }

      return {
        provider: def.id,
        name: def.name,
        envVar: def.envVar,
        source: 'none',
        maskedKey: 'Not configured',
        isConfigured: false,
      };
    });
  }

  public setApiKey(provider: string, apiKey: string): { success: boolean; provider: string; configPath: string } {
    const userConfig = this.loadUserConfig();
    if (!userConfig.providers) userConfig.providers = {};
    if (!userConfig.providers[provider]) userConfig.providers[provider] = {};

    userConfig.providers[provider].apiKey = apiKey.trim();
    this.saveUserConfig(userConfig);

    return {
      success: true,
      provider,
      configPath: this.getUserConfigPath(),
    };
  }

  public removeApiKey(provider: string): { success: boolean; provider: string } {
    const userConfig = this.loadUserConfig();
    if (userConfig.providers && userConfig.providers[provider]) {
      delete userConfig.providers[provider].apiKey;
      this.saveUserConfig(userConfig);
    }
    return { success: true, provider };
  }
}
