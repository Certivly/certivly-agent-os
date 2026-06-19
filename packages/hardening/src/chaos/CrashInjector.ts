import { AgentDaemon } from '../../../daemon/src/AgentDaemon';

export class CrashInjector {
  constructor(private daemon: AgentDaemon) {}

  public async injectRandomCrashes() {
    // Simulate sudden exit during important operations
    this.daemon.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: 'daemon',
      topic: 'chaos.crash',
      payload: { reason: 'simulated_OOM' }
    });

    // In a real chaos test, we might force a process.exit() here
    // For unit testing, we stop the daemon forcefully
    await this.daemon.stop();
  }
}
