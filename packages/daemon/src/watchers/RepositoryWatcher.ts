import * as chokidar from 'chokidar';
import { EventBus } from '../streaming/EventBus';

export class RepositoryWatcher {
  private watchers = new Map<string, chokidar.FSWatcher>();

  constructor(private bus: EventBus) {}

  public async watch(repositoryId: string, rootPath: string): Promise<void> {
    if (this.watchers.has(repositoryId)) {
      return;
    }

    const watcher = chokidar.watch(rootPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });

    watcher
      .on('add', path => this.emit(repositoryId, 'add', path))
      .on('change', path => this.emit(repositoryId, 'change', path))
      .on('unlink', path => this.emit(repositoryId, 'unlink', path));

    this.watchers.set(repositoryId, watcher);
    
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: `daemon`,
      topic: 'daemon.repository.watching',
      payload: { repositoryId, rootPath }
    });
  }

  public async unwatch(repositoryId: string): Promise<void> {
    const watcher = this.watchers.get(repositoryId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(repositoryId);
    }
  }

  private emit(repositoryId: string, eventName: string, path: string): void {
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: `repository:${repositoryId}`,
      topic: 'daemon.repository.updated',
      payload: { repositoryId, eventName, path }
    });
  }
}
