import { ClientConnection } from './ClientSession';
import { ClientRegistry } from './ClientRegistry';

export class ClientManager {
  private registry: ClientRegistry;

  constructor() {
    this.registry = new ClientRegistry();
  }

  public async registerClient(client: ClientConnection): Promise<void> {
    // Basic authentication or validation could happen here
    this.registry.register(client);
    // Start heartbeat monitoring if needed
  }

  public async unregisterClient(clientId: string): Promise<void> {
    this.registry.unregister(clientId);
  }

  public getClient(clientId: string): ClientConnection | undefined {
    return this.registry.get(clientId);
  }
}
