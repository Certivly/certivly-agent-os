import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PluginManager } from '../src/plugins/PluginManager';

describe('PluginManager Tests (Suggestion 04)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('1. Built-in plugin is loaded and active by default', () => {
    const manager = new PluginManager({ workspaceRoot: tmpDir });
    const plugins = manager.load();

    const builtinRepoMap = plugins.find((p) => p.manifest.id === 'repo-map');
    expect(builtinRepoMap).toBeDefined();
    expect(builtinRepoMap?.source).toBe('builtin');
    expect(builtinRepoMap?.status).toBe('active');
    expect(builtinRepoMap?.manifest.tools).toContain('repo_map');
  });

  it('2. Workspace plugin requiring ungranted permissions is denied by default', () => {
    const pluginDir = path.join(tmpDir, '.agentos', 'plugins', 'custom-writer');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'custom-writer',
        version: '1.0.0',
        permissions: ['write_workspace', 'execute_command'],
      }),
      'utf8'
    );

    // Default policy only allows read_workspace
    const manager = new PluginManager({ workspaceRoot: tmpDir });
    manager.load();

    const denied = manager.getDeniedPlugins();
    const writerPlugin = denied.find((p) => p.manifest.id === 'custom-writer');
    expect(writerPlugin).toBeDefined();
    expect(writerPlugin?.status).toBe('denied');
    expect(writerPlugin?.error).toContain('ungranted permission');
  });

  it('3. Workspace plugin with granted permissions is active', () => {
    const pluginDir = path.join(tmpDir, '.agentos', 'plugins', 'custom-reader');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'custom-reader',
        version: '1.0.0',
        permissions: ['read_workspace'],
      }),
      'utf8'
    );

    const manager = new PluginManager({
      workspaceRoot: tmpDir,
      allowedPermissions: ['read_workspace'],
    });
    manager.load();

    const active = manager.getActivePlugins();
    const readerPlugin = active.find((p) => p.manifest.id === 'custom-reader');
    expect(readerPlugin).toBeDefined();
    expect(readerPlugin?.status).toBe('active');
  });

  it('4. Explicitly denied plugin ID is rejected', () => {
    const manager = new PluginManager({
      workspaceRoot: tmpDir,
      deniedPluginIds: ['repo-map'],
    });
    manager.load();

    const denied = manager.getDeniedPlugins();
    const repoMap = denied.find((p) => p.manifest.id === 'repo-map');
    expect(repoMap).toBeDefined();
    expect(repoMap?.status).toBe('denied');
  });
});
