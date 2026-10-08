import { AgentError } from '@agent-os/shared';

export class CapabilitySandbox {
  // Simple timeout encapsulation
  public async executeIsolated<T>(fn: () => Promise<T>, timeoutMs: number = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AgentError('Sandbox Timeout Exceeded'));
      }, timeoutMs);

      fn().then(res => {
        clearTimeout(timer);
        resolve(res);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
