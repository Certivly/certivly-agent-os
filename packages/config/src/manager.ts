import { AgentConfig, ConfigSchema } from './schema';
import { ConfigError } from '@agent-os/shared';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigManager {
  private configPath: string;
  private currentConfig: AgentConfig | null = null;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  public load(): AgentConfig {
    if (!fs.existsSync(this.configPath)) {
      // Return default config if no file exists
      this.currentConfig = ConfigSchema.parse({});
      return this.currentConfig;
    }

    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsedJson = JSON.parse(raw);
      this.currentConfig = ConfigSchema.parse(parsedJson);
      return this.currentConfig;
    } catch (error: any) {
      throw new ConfigError(`Failed to load config: ${error.message}`);
    }
  }

  public save(config: AgentConfig): void {
    try {
      const validated = ConfigSchema.parse(config);
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(validated, null, 2));
      this.currentConfig = validated;
    } catch (error: any) {
      throw new ConfigError(`Failed to save config: ${error.message}`);
    }
  }

  public getConfig(): AgentConfig {
    if (!this.currentConfig) {
      return this.load();
    }
    return this.currentConfig;
  }
}
