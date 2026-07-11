import * as os from 'os';
import * as path from 'path';
import { DaemonClient } from '@agent-os/daemon';

const DEFAULT_SOCKET = process.platform === 'win32'
  ? '\\\\.\\pipe\\agentos'
  : path.join(os.tmpdir(), 'agentos.sock');

/**
 * DaemonMode — used by AgentRuntime when --daemon flag is passed.
 * Routes requests to the running daemon process instead of booting a local pipeline.
 */
export class DaemonMode {
  private client: DaemonClient;
  private sessionId: string | null = null;

  constructor(
    socketPath: string = process.env.AGENTOS_SOCKET ?? DEFAULT_SOCKET,
    tcpPort?: number
  ) {
    this.client = socketPath
      ? new DaemonClient(socketPath)
      : new DaemonClient(undefined, tcpPort);
  }

  public async connect(): Promise<boolean> {
    try {
      await this.client.connect();
      await this.client.request('PING', {});
      return true;
    } catch {
      return false;
    }
  }

  public isConnected(): boolean {
    return this.client.isConnected();
  }

  public async ensureSession(repositoryId: string = 'default', rootPath: string = process.cwd()): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const res = await this.client.request('CREATE_SESSION', { repositoryId, rootPath });
    this.sessionId = res.data?.sessionId ?? 'unknown';
    return this.sessionId!;
  }

  public async handleRequest(sessionId: string, input: string): Promise<string> {
    const res = await this.client.request('EXECUTE', {
      sessionId,
      input,
      goal: input
    });
    if (!res.success) throw new Error(res.error ?? 'Daemon execution failed');
    return JSON.stringify(res.data, null, 2);
  }

  public async getStatus(): Promise<any> {
    const res = await this.client.request('GET_STATUS', {});
    return res.data;
  }

  public disconnect(): void {
    this.client.disconnect();
  }
}
