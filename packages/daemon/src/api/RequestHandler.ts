import { AgentDaemon } from '../AgentDaemon';

export interface DaemonRequest {
  id: string;
  type: string;
  payload: any;
}

export class RequestHandler {
  constructor(private daemon: AgentDaemon) {}

  public async handle(clientId: string, request: DaemonRequest): Promise<any> {
    switch (request.type) {
      case 'EXECUTE':
        return await this.daemon.execute(request.payload);
      case 'GET_SESSION':
        return await this.daemon.getSession(request.payload.sessionId);
      case 'GET_REPOSITORY':
        return await this.daemon.getRepository(request.payload.repositoryId);
      default:
        throw new Error(`Unknown request type: ${request.type}`);
    }
  }
}
