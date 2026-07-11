import { AgentDaemon } from '../AgentDaemon';

export interface DaemonRequest {
  id: string;
  type: string;
  payload: any;
}

export type RequestType =
  | 'EXECUTE'           // Execute a goal: { sessionId, input }
  | 'CREATE_SESSION'    // Create session: { repositoryId, rootPath }
  | 'END_SESSION'       // End session: { sessionId }
  | 'GET_SESSION'       // Get session state: { sessionId }
  | 'LIST_SESSIONS'     // List all active sessions
  | 'GET_REPOSITORY'    // Get repo workspace: { repositoryId }
  | 'LIST_REPOSITORIES' // List all registered repos
  | 'GET_STATUS'        // Daemon status + metrics
  | 'PING';             // Connectivity check

export class RequestHandler {
  constructor(private daemon: AgentDaemon) {}

  public async handle(clientId: string, request: DaemonRequest): Promise<any> {
    switch (request.type as RequestType) {

      case 'PING':
        return { pong: true, timestamp: Date.now() };

      case 'GET_STATUS':
        return {
          uptime: process.uptime(),
          sessions: this.daemon.getActiveSessions(),
          metrics: this.daemon.metrics.getAll(),
          pid: process.pid
        };

      case 'EXECUTE':
        return await this.daemon.execute({
          id: request.id,
          type: 'EXECUTE',
          payload: request.payload
        });

      case 'CREATE_SESSION': {
        const { clientIdOverride, repositoryId, rootPath } = request.payload;
        const sessionId = await this.daemon.createSession(
          clientIdOverride ?? clientId,
          repositoryId ?? 'default',
          rootPath ?? process.cwd()
        );
        return { sessionId };
      }

      case 'END_SESSION':
        await this.daemon.endSession(request.payload.sessionId);
        return { ended: true };

      case 'GET_SESSION':
        return await this.daemon.getSession(request.payload.sessionId);

      case 'LIST_SESSIONS':
        return { sessions: this.daemon.getActiveSessions() };

      case 'GET_REPOSITORY':
        return await this.daemon.getRepository(
          request.payload.repositoryId,
          request.payload.rootPath
        );

      case 'LIST_REPOSITORIES':
        return { repositories: this.daemon.listRepositories() };

      default:
        throw new Error(`Unknown request type: ${request.type}`);
    }
  }
}
