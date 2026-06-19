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
      const sessionId = `storm-session-${id}`;
      // Connect
      this.coordinator.createSession(sessionId, 'storm-repo', `client-${id}`);
      
      // Simulate quick action
      await new Promise(r => setTimeout(r, Math.random() * 10));
      
      // Disconnect
      this.coordinator.endSession(sessionId);
      
      // Reconnect immediately
      this.coordinator.createSession(sessionId, 'storm-repo', `client-${id}`);
    }
  }
}
