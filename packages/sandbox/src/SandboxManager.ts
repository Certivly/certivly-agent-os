import { Sandbox } from './models';
import { LocalWorkspaceSandbox } from './local';
import { GitWorktreeSandbox, isGitRepository } from './worktree';
import { SandboxEvents } from './SandboxEvents';
import { EventStore } from '@agent-os/events';
import { metrics } from '@agent-os/metrics';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

export class SandboxManager {
  private activeSandboxes: Map<string, Sandbox> = new Map();

  constructor(
    private eventStore: EventStore,
    private defaultWorkspaceDir: string
  ) {}

  public async createSandbox(type: 'local' | 'worktree' = 'worktree'): Promise<Sandbox> {
    const startTime = Date.now();
    const id = crypto.randomUUID();
    let sandbox: Sandbox;

    // Check if git repo when worktree strategy is requested
    let effectiveType = type;
    if (type === 'worktree') {
      const isGit = await isGitRepository(this.defaultWorkspaceDir);
      if (!isGit) {
        effectiveType = 'local';
      }
    }

    if (effectiveType === 'worktree') {
      sandbox = new GitWorktreeSandbox(id, this.defaultWorkspaceDir);
    } else {
      sandbox = new LocalWorkspaceSandbox(id, this.defaultWorkspaceDir);
    }

    try {
      await sandbox.create();
      this.activeSandboxes.set(id, sandbox);
      
      const duration = Date.now() - startTime;
      metrics.counter('sandboxes_created').inc();
      metrics.histogram('sandbox_creation_duration').observe(duration);

      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: SandboxEvents.CREATED,
        timestamp: new Date().toISOString(),
        requestId: 'internal',
        sessionId: 'internal',
        source: 'SandboxManager',
        payload: { sandboxId: id, type: effectiveType },
        version: '1.0'
      });

      return sandbox;
    } catch (error) {
      throw error;
    }
  }

  public getSandbox(id: string): Sandbox {
    const sandbox = this.activeSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox ${id} not found or expired`);
    }
    return sandbox;
  }

  public async destroySandbox(id: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(id);
    if (!sandbox) return;

    try {
      await sandbox.destroy();
    } finally {
      this.activeSandboxes.delete(id);
    }

    metrics.counter('sandboxes_destroyed').inc();

    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: SandboxEvents.DESTROYED,
      timestamp: new Date().toISOString(),
      requestId: 'internal',
      sessionId: 'internal',
      source: 'SandboxManager',
      payload: { sandboxId: id },
      version: '1.0'
    });
  }

  public async withSandbox<T>(
    fn: (sandbox: Sandbox) => Promise<T>,
    type: 'local' | 'worktree' = 'worktree'
  ): Promise<T> {
    const sandbox = await this.createSandbox(type);
    try {
      return await fn(sandbox);
    } finally {
      await this.destroySandbox(sandbox.id);
    }
  }

  public async gcStaleSandboxes(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<string[]> {
    const cleanedIds: string[] = [];
    const sandboxesDir = path.join(this.defaultWorkspaceDir, '.agentos', 'sandboxes');
    if (!fsSync.existsSync(sandboxesDir)) {
      return cleanedIds;
    }

    const entries = await fs.readdir(sandboxesDir);
    const now = Date.now();

    for (const entry of entries) {
      const fullPath = path.join(sandboxesDir, entry);
      try {
        const stats = await fs.stat(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await this.destroySandbox(entry);
          if (fsSync.existsSync(fullPath)) {
            await fs.rm(fullPath, { recursive: true, force: true });
          }
          cleanedIds.push(entry);
        }
      } catch (_err) {
        // best-effort: skip entry if stat or removal fails
      }
    }

    return cleanedIds;
  }

  public async cleanupExpired(): Promise<void> {
    const ids = Array.from(this.activeSandboxes.keys());
    for (const id of ids) {
      await this.destroySandbox(id);
    }
  }
}
