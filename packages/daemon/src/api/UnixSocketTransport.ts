import * as net from 'net';
import { Transport } from './Transport';

/**
 * Unix domain socket transport — used by the daemon process to accept CLI connections.
 * Each connected client gets a line-delimited JSON framed channel.
 */
export class UnixSocketTransport implements Transport {
  private server: net.Server;
  private clients = new Map<string, net.Socket>();
  private clientCounter = 0;

  private messageHandlers: Array<(clientId: string, msg: unknown) => void> = [];
  private connectHandlers: Array<(clientId: string) => void> = [];
  private disconnectHandlers: Array<(clientId: string) => void> = [];

  constructor(private socketPath: string) {
    this.server = net.createServer(socket => this.onClientSocket(socket));
  }

  public async start(): Promise<void> {
    await this.removeStaleSocket();
    return new Promise((resolve, reject) => {
      this.server.on('error', reject);
      this.server.listen(this.socketPath, () => resolve());
    });
  }

  public async stop(): Promise<void> {
    for (const [, socket] of this.clients) socket.destroy();
    this.clients.clear();
    return new Promise(resolve => this.server.close(() => resolve()));
  }

  public async broadcast(message: unknown): Promise<void> {
    const frame = JSON.stringify(message) + '\n';
    for (const [, socket] of this.clients) {
      if (!socket.destroyed) socket.write(frame);
    }
  }

  public async send(clientId: string, message: unknown): Promise<void> {
    const socket = this.clients.get(clientId);
    if (socket && !socket.destroyed) {
      socket.write(JSON.stringify(message) + '\n');
    }
  }

  public onMessage(handler: (clientId: string, message: unknown) => void): void {
    this.messageHandlers.push(handler);
  }

  public onConnect(handler: (clientId: string) => void): void {
    this.connectHandlers.push(handler);
  }

  public onDisconnect(handler: (clientId: string) => void): void {
    this.disconnectHandlers.push(handler);
  }

  private onClientSocket(socket: net.Socket): void {
    const clientId = `client_${++this.clientCounter}`;
    this.clients.set(clientId, socket);

    for (const h of this.connectHandlers) h(clientId);

    let buf = '';
    socket.setEncoding('utf-8');
    socket.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          for (const h of this.messageHandlers) h(clientId, msg);
        } catch {
          // malformed frame — ignore
        }
      }
    });

    socket.on('close', () => {
      this.clients.delete(clientId);
      for (const h of this.disconnectHandlers) h(clientId);
    });

    socket.on('error', () => {
      this.clients.delete(clientId);
      for (const h of this.disconnectHandlers) h(clientId);
    });
  }

  private async removeStaleSocket(): Promise<void> {
    try {
      const fs = await import('fs');
      await fs.promises.unlink(this.socketPath);
    } catch { /* no stale socket, fine */ }
  }
}
