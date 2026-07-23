import { SessionCoordinator } from '../../../daemon/src/sessions/SessionCoordinator';

export class SessionStorm {
  constructor(private coordinator: SessionCoordinator) {}

  public async run(concurrency: number, iterations: number) {
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      promises.push(this.cycleSession(i, iterations));
    }
    await Promise.all(promises);
  }

  private async cycleSession(id: number, iterations: number) {
    for (let i = 0; i < iterations; i++) {
      // Connect
      const sessId = await this.coordinator.createSession(`client-${id}`, 'storm-repo', '/ws');
      
      // Simulate quick action
      await new Promise(r => setTimeout(r, Math.random() * 5));
      
      // Disconnect & release runtime
      this.coordinator.endSession(sessId);
    }
  }
}
