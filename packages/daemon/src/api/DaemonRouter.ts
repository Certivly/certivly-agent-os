import { Transport } from './Transport';
import { RequestHandler, DaemonRequest } from './RequestHandler';
import { ResponseHandler } from './ResponseHandler';
import { ClientManager } from '../clients/ClientManager';

export class DaemonRouter {
  constructor(
    private transport: Transport,
    private requestHandler: RequestHandler,
    private responseHandler: ResponseHandler,
    private clientManager: ClientManager
  ) {
    this.setupRoutes();
  }

  private setupRoutes() {
    this.transport.onConnect((clientId) => {
      // Create a basic client connection object
      this.clientManager.registerClient({
        id: clientId,
        type: 'cli', // Defaulting to cli for now
        send: async (msg) => this.transport.send(clientId, msg),
        receive: async () => { /* stub */ }
      });
    });

    this.transport.onDisconnect((clientId) => {
      this.clientManager.unregisterClient(clientId);
    });

    this.transport.onMessage(async (clientId, message: unknown) => {
      const request = message as DaemonRequest;
      try {
        const result = await this.requestHandler.handle(clientId, request);
        await this.responseHandler.sendSuccess(clientId, request.id, result);
      } catch (error: any) {
        await this.responseHandler.sendError(clientId, request.id, error);
      }
    });
  }
}
