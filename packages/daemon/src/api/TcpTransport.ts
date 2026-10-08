import * as net from 'net';
import { Transport } from './Transport';

/**
 * TCP transport — alternative to Unix socket for Windows compatibility or remote access.
 */
export class TcpTransport implements Transport {
  private server: net.Server;
  private clients = new Map<string, net.Socket>();
  private clientCounter = 0;

  private messageHandlers: Array<(clientId: string, msg: unknown) => void> = [];
  private connectHandlers: Array<(clientId: string) => void> = [];
  private disconnectHandlers: Array<(clientId: string) => void> = [];

  constructor(private port: number, private host: string = '127.0.0.1') {
    this.server = net.createServer(socket => this.onClientSocket(socket));
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => resolve());
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
    if (socket && !socket.destroyed) socket.write(JSON.stringify(message) + '\n');
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
    const clientId = `tcp_client_${++this.clientCounter}`;
    this.clients.set(clientId, socket);
    for (const h of this.connectHandlers) h(clientId);

    let buf = '';
    socket.setEncoding('utf-8');
    socket.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          for (const h of this.messageHandlers) h(clientId, parsed);
        } catch (_err) {
          // best-effort: skip malformed JSON frame
        }
      }
    });
    socket.on('close', () => { this.clients.delete(clientId); for (const h of this.disconnectHandlers) h(clientId); });
    socket.on('error', () => { this.clients.delete(clientId); for (const h of this.disconnectHandlers) h(clientId); });
  }
}
