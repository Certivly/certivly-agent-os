import { ClientConnection } from './ClientSession';

export class ClientRegistry {
  private clients = new Map<string, ClientConnection>();

  public register(client: ClientConnection): void {
    this.clients.set(client.id, client);
  }

  public unregister(clientId: string): boolean {
    return this.clients.delete(clientId);
  }

  public get(clientId: string): ClientConnection | undefined {
    return this.clients.get(clientId);
  }

  public getAll(): ClientConnection[] {
    return Array.from(this.clients.values());
  }

  public has(clientId: string): boolean {
    return this.clients.has(clientId);
  }
}
