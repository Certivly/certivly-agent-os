export const DaemonEvents = {
  STARTED: 'daemon.started',
  STOPPED: 'daemon.stopped',
  CLIENT_CONNECTED: 'daemon.client.connected',
  CLIENT_DISCONNECTED: 'daemon.client.disconnected',
  REPOSITORY_LOADED: 'daemon.repository.loaded',
  REPOSITORY_UPDATED: 'daemon.repository.updated',
  SESSION_CREATED: 'daemon.session.created',
  SESSION_RECOVERED: 'daemon.session.recovered',
  RUNTIME_ASSIGNED: 'daemon.runtime.assigned'
} as const;
