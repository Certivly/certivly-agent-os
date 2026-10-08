export interface McpTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: unknown): Promise<unknown>;
}
