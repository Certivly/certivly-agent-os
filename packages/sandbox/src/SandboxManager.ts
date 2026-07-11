import { Sandbox } from './models';
import { LocalWorkspaceSandbox } from './local';
import { GitWorktreeSandbox } from './worktree';
import { SandboxEvents } from './SandboxEvents';
import { EventStore } from '@agent-os/events';
import { metrics } from '@agent-os/metrics';
import * as crypto from 'crypto';

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

    if (type === 'worktree') {
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
        payload: { sandboxId: id, type },
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

    await sandbox.destroy();
    this.activeSandboxes.delete(id);

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

  public async cleanupExpired(): Promise<void> {
    // In a real system, we'd check timestamps. For now, we clean all.
    const ids = Array.from(this.activeSandboxes.keys());
    for (const id of ids) {
      await this.destroySandbox(id);
    }
  }
}
