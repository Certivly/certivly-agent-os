import { AgentConfig, ConfigSchema } from './schema';
import { ConfigError } from '@agent-os/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ConfigManagerOptions {
  configPath?: string;
  userConfigPath?: string;
  projectConfigPath?: string | null;
  workspaceRoot?: string;
  enableCascading?: boolean;
}

export function deepMergeConfig(base: AgentConfig, override: Partial<AgentConfig>): AgentConfig {
  const merged: any = { ...base };

  for (const [key, val] of Object.entries(override)) {
    if (val === undefined || val === null) continue;

    if (key === 'providers' && typeof val === 'object' && !Array.isArray(val)) {
      merged.providers = { ...(base.providers || {}) };
      for (const [pKey, pVal] of Object.entries(val as Record<string, any>)) {
        merged.providers[pKey] = {
          ...(merged.providers[pKey] || {}),
          ...pVal,
        };
      }
    } else if (key === 'agent' && typeof val === 'object' && !Array.isArray(val)) {
      merged.agent = {
        ...(base.agent || {}),
        ...val,
      };
      if ((val as any).modelRoles) {
        merged.agent.modelRoles = {
          ...(base.agent?.modelRoles || {}),
          ...((val as any).modelRoles || {}),
        };
      }
    } else if (key === 'runtime' && typeof val === 'object' && !Array.isArray(val)) {
      merged.runtime = {
        ...(base.runtime || {}),
        ...val,
      };
    } else if (key === 'mcpServers' && typeof val === 'object' && !Array.isArray(val)) {
      merged.mcpServers = {
        ...(base.mcpServers || {}),
        ...val,
      };
    } else if (key === 'hooks' && typeof val === 'object' && !Array.isArray(val)) {
      merged.hooks = {
        ...(base.hooks || {}),
        ...val,
      };
    } else if (key === 'repository' && typeof val === 'object' && !Array.isArray(val)) {
      merged.repository = {
        ...(base.repository || {}),
        ...val,
      };
    } else if (key === 'evalModels' && Array.isArray(val)) {
      merged.evalModels = val;
    } else {
      merged[key] = val;
    }
  }

  return ConfigSchema.parse(merged);
}

export class ConfigManager {
  private configPath: string;
  private userConfigPath: string;
  private projectConfigPath: string | null = null;
  private workspaceRoot: string;
  private enableCascading: boolean;
  private currentConfig: AgentConfig | null = null;

  public static getUserConfigDir(): string {
    return path.join(os.homedir(), '.agentos');
  }

  public static getUserConfigPath(): string {
    return path.join(this.getUserConfigDir(), 'config.json');
  }

  public static findProjectConfigPath(cwd: string = process.cwd()): string | null {
    const directLocal = path.join(cwd, 'agentos.config.json');
    if (fs.existsSync(directLocal)) {
      return directLocal;
    }

    const dotLocal = path.join(cwd, '.agentos', 'config.json');
    if (fs.existsSync(dotLocal)) {
      const userPath = this.getUserConfigPath();
      if (path.resolve(dotLocal).toLowerCase() !== path.resolve(userPath).toLowerCase()) {
        return dotLocal;
      }
    }

    return null;
  }

  constructor(configPathOrOptions?: string | ConfigManagerOptions) {
    if (typeof configPathOrOptions === 'string') {
      this.configPath = configPathOrOptions;
      this.userConfigPath = ConfigManager.getUserConfigPath();
      this.workspaceRoot = process.cwd();
      // An explicit single string path disables cascading for backwards compatibility and test isolation
      this.enableCascading = false;
    } else {
      const opts = configPathOrOptions || {};
      this.workspaceRoot = opts.workspaceRoot || process.cwd();
      this.userConfigPath = opts.userConfigPath || ConfigManager.getUserConfigPath();
      this.projectConfigPath = opts.projectConfigPath !== undefined
        ? opts.projectConfigPath
        : ConfigManager.findProjectConfigPath(this.workspaceRoot);
      this.configPath = opts.configPath || this.projectConfigPath || this.userConfigPath;
      this.enableCascading = opts.enableCascading !== undefined ? opts.enableCascading : true;
    }
  }

  public load(): AgentConfig {
    if (!this.enableCascading) {
      return this.loadSingleFile(this.configPath);
    }

    // 1. Load User Config (Global baseline)
    let userConfig: AgentConfig;
    if (fs.existsSync(this.userConfigPath)) {
      try {
        const raw = fs.readFileSync(this.userConfigPath, 'utf8');
        userConfig = ConfigSchema.parse(JSON.parse(raw));
      } catch (err: any) {
        throw new ConfigError(`Failed to load user config from ${this.userConfigPath}: ${err.message}`);
      }
    } else {
      userConfig = ConfigSchema.parse({});
      try {
        const dir = path.dirname(this.userConfigPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.userConfigPath, JSON.stringify(userConfig, null, 2));
      } catch (_err: any) {
        // Fallback silently if read-only user folder
      }
    }

    // 2. Cascade Project Config if it exists and differs from user config
    const projPath = (
      this.configPath &&
      path.resolve(this.configPath).toLowerCase() !== path.resolve(this.userConfigPath).toLowerCase() &&
      fs.existsSync(this.configPath)
    )
      ? this.configPath
      : this.projectConfigPath;

    if (projPath && fs.existsSync(projPath)) {
      try {
        const raw = fs.readFileSync(projPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.currentConfig = deepMergeConfig(userConfig, parsed);
        return this.currentConfig;
      } catch (err: any) {
        throw new ConfigError(`Failed to load project config from ${projPath}: ${err.message}`);
      }
    }

    this.currentConfig = userConfig;
    return this.currentConfig;
  }

  private loadSingleFile(filePath: string): AgentConfig {
    if (!fs.existsSync(filePath)) {
      this.currentConfig = ConfigSchema.parse({});
      try {
        this.saveToFile(filePath, this.currentConfig);
      } catch (_err: any) {
        // Fallback silently if read-only
      }
      return this.currentConfig;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsedJson = JSON.parse(raw);
      this.currentConfig = ConfigSchema.parse(parsedJson);
      return this.currentConfig;
    } catch (error: any) {
      throw new ConfigError(`Failed to load config: ${error.message}`);
    }
  }

  public save(config: AgentConfig, target: 'user' | 'project' = 'user'): void {
    const validated = ConfigSchema.parse(config);
    if (!this.enableCascading) {
      this.saveToFile(this.configPath, validated);
      this.currentConfig = validated;
      return;
    }

    if (target === 'project') {
      const targetPath = this.projectConfigPath || path.join(this.workspaceRoot, '.agentos', 'config.json');
      this.saveToFile(targetPath, validated);
    } else {
      this.saveToFile(this.userConfigPath, validated);
    }
    this.currentConfig = validated;
  }

  private saveToFile(filePath: string, config: AgentConfig): void {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    } catch (error: any) {
      throw new ConfigError(`Failed to save config to ${filePath}: ${error.message}`);
    }
  }

  public getConfig(): AgentConfig {
    if (!this.currentConfig) {
      return this.load();
    }
    return this.currentConfig;
  }

  public getUserConfigPath(): string {
    return this.userConfigPath;
  }

  public getProjectConfigPath(): string | null {
    return this.projectConfigPath;
  }

  public getActiveConfigPath(): string {
    return (this.enableCascading && this.projectConfigPath) ? this.projectConfigPath : this.configPath;
  }
}
