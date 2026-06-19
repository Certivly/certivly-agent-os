export interface DaemonConfig {
  socketPath: string;
  tcpPort?: number;
  dataDir: string;
  maxConcurrentRuntimes: number;
}
