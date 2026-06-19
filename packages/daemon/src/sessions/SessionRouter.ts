import { SessionCoordinator } from './SessionCoordinator';
import { RuntimePool } from './RuntimePool';

export class SessionRouter {
  constructor(
    private coordinator: SessionCoordinator,
    private runtimePool: RuntimePool
  ) {}

  public async routeMessage(sessionId: string, message: any): Promise<any> {
    const session = this.coordinator.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const runtime = this.runtimePool.acquireRuntime(sessionId);
    return await runtime.execute(message);
  }
}
