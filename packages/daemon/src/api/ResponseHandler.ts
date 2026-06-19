import { Transport } from './Transport';

export interface DaemonResponse {
  id: string;
  status: 'success' | 'error';
  payload?: any;
  error?: string;
}

export class ResponseHandler {
  constructor(private transport: Transport) {}

  public async sendSuccess(clientId: string, requestId: string, payload: any): Promise<void> {
    const response: DaemonResponse = {
      id: requestId,
      status: 'success',
      payload
    };
    await this.transport.send(clientId, response);
  }

  public async sendError(clientId: string, requestId: string, error: Error): Promise<void> {
    const response: DaemonResponse = {
      id: requestId,
      status: 'error',
      error: error.message
    };
    await this.transport.send(clientId, response);
  }
}
