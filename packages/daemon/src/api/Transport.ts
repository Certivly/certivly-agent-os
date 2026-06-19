export interface Transport {
  start(): Promise<void>;
  stop(): Promise<void>;
  broadcast(message: unknown): Promise<void>;
  send(clientId: string, message: unknown): Promise<void>;
  onMessage(handler: (clientId: string, message: unknown) => void): void;
  onConnect(handler: (clientId: string) => void): void;
  onDisconnect(handler: (clientId: string) => void): void;
}
