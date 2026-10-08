import * as net from 'net';

export interface DaemonResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Client that connects to a running AgentDaemon over Unix socket or TCP.
 * Used by the CLI to send requests and receive streaming events.
 */
export class DaemonClient {
  private socket: net.Socket | null = null;
  private pendingRequests = new Map<string, { resolve: (r: DaemonResponse) => void; reject: (e: Error) => void }>();
  private eventHandlers: Array<(event: any) => void> = [];
  private reqCounter = 0;
  private buf = '';

  constructor(
    private socketPath?: string,
    private tcpPort?: number,
    private tcpHost: string = '127.0.0.1'
  ) {}

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socketPath
        ? net.createConnection(this.socketPath)
        : net.createConnection(this.tcpPort!, this.tcpHost);

      socket.setEncoding('utf-8');
      socket.once('connect', () => { this.socket = socket; resolve(); });
      socket.once('error', reject);

      socket.on('data', (chunk: string) => {
        this.buf += chunk;
        const lines = this.buf.split('\n');
        this.buf = lines.pop() ?? '';
        for (const line of lines) {
          try {
            this.onFrame(JSON.parse(line));
          } catch (_err) {
            // best-effort: skip malformed JSON frame
          }
        }
      });

      socket.on('close', () => { this.socket = null; });
    });
  }

  public disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  public isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  public async request(type: string, payload: any): Promise<DaemonResponse> {
    if (!this.isConnected()) throw new Error('Not connected to daemon');

    const id = `req_${++this.reqCounter}_${Date.now()}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.socket!.write(JSON.stringify({ id, type, payload }) + '\n');
    });
  }

  public onEvent(handler: (event: any) => void): () => void {
    this.eventHandlers.push(handler);
    return () => { this.eventHandlers = this.eventHandlers.filter(h => h !== handler); };
  }

  private onFrame(frame: any): void {
    // Response to a pending request
    if (frame.id && this.pendingRequests.has(frame.id)) {
      const handler = this.pendingRequests.get(frame.id)!;
      this.pendingRequests.delete(frame.id);
      if (frame.success === false) {
        handler.reject(new Error(frame.error ?? 'Unknown daemon error'));
      } else {
        handler.resolve(frame as DaemonResponse);
      }
      return;
    }
    // Streaming event
    if (frame.channel || frame.topic) {
      for (const h of this.eventHandlers) h(frame);
    }
  }
}
