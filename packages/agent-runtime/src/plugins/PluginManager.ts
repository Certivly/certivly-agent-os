import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '@agent-os/shared';

export type PluginPermission = 'read_workspace' | 'write_workspace' | 'execute_command' | 'network';

export interface PluginManifest {
  id: string;
  name?: string;
  version: string;
  description?: string;
  type?: 'tool' | 'workflow' | 'hook' | 'provider' | 'subagent';
  tools?: string[];
  workflows?: string[];
  permissions: PluginPermission[];
  enabled?: boolean;
}

export interface PluginStatus {
  manifest: PluginManifest;
  source: 'builtin' | 'workspace' | 'global';
  status: 'active' | 'denied' | 'error';
  error?: string;
}

export interface PluginManagerOptions {
  workspaceRoot?: string;
  allowedPermissions?: PluginPermission[];
  deniedPluginIds?: string[];
}

export class PluginManager {
  private plugins: PluginStatus[] = [];

  constructor(private options: PluginManagerOptions = {}) {}

  public static getBuiltinPlugins(): PluginManifest[] {
    return [
      {
        id: 'repo-map',
        name: 'Repository Map Plugin',
        version: '1.0.0',
        description: 'AST and BM25 repository symbol outline generation',
        type: 'tool',
        tools: ['repo_map'],
        workflows: ['explore'],
        permissions: ['read_workspace'],
        enabled: true,
      },
    ];
  }

  public load(): PluginStatus[] {
    this.plugins = [];

    // 1. Built-in plugins first
    for (const manifest of PluginManager.getBuiltinPlugins()) {
      this.plugins.push(this.evaluatePlugin(manifest, 'builtin'));
    }

    // 2. Workspace plugins second (.agentos/plugins/*/plugin.json)
    if (this.options.workspaceRoot) {
      const wsPluginsDir = path.join(this.options.workspaceRoot, '.agentos', 'plugins');
      this.loadFromDirectory(wsPluginsDir, 'workspace');
    }

    // 3. User-global plugins last (~/.agentos/plugins/*/plugin.json)
    try {
      const globalPluginsDir = path.join(os.homedir(), '.agentos', 'plugins');
      this.loadFromDirectory(globalPluginsDir, 'global');
    } catch (err) {
      logger.warn('plugin', 'global_dir.read_failed', `Failed reading global plugin dir: ${err instanceof Error ? err.message : String(err)}`);
    }

    return this.plugins;
  }

  private loadFromDirectory(dir: string, source: 'workspace' | 'global'): void {
    if (!fs.existsSync(dir)) return;

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch (err) {
      logger.warn('plugin', 'readdir_failed', `Failed reading plugins dir ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    for (const entry of entries) {
      const manifestPath = path.join(dir, entry, 'plugin.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(raw) as PluginManifest;
          this.plugins.push(this.evaluatePlugin(manifest, source));
        } catch (err) {
          this.plugins.push({
            manifest: { id: entry, version: '0.0.0', permissions: [] },
            source,
            status: 'error',
            error: `Failed to load ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }
  }

  private evaluatePlugin(manifest: PluginManifest, source: 'builtin' | 'workspace' | 'global'): PluginStatus {
    if (manifest.enabled === false) {
      return { manifest, source, status: 'denied', error: 'Plugin explicitly disabled in manifest' };
    }

    if (this.options.deniedPluginIds?.includes(manifest.id)) {
      return { manifest, source, status: 'denied', error: `Plugin ${manifest.id} is in denied list` };
    }

    // Builtins are trusted by default with read_workspace
    if (source === 'builtin') {
      return { manifest, source, status: 'active' };
    }

    // Default policy: read_workspace is allowed; write_workspace and execute_command require explicit allow
    const allowed = this.options.allowedPermissions ?? ['read_workspace'];
    const ungranted = manifest.permissions.filter((p) => !allowed.includes(p));

    if (ungranted.length > 0) {
      return {
        manifest,
        source,
        status: 'denied',
        error: `Requires ungranted permission(s): ${ungranted.join(', ')}`,
      };
    }

    return { manifest, source, status: 'active' };
  }

  public listPlugins(): PluginStatus[] {
    return [...this.plugins];
  }

  public getActivePlugins(): PluginStatus[] {
    return this.plugins.filter((p) => p.status === 'active');
  }

  public getDeniedPlugins(): PluginStatus[] {
    return this.plugins.filter((p) => p.status === 'denied');
  }
}
