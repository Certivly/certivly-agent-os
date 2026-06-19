export interface ClientConnection {
  id: string;
  type: "cli" | "vscode" | "web" | "mcp";
  send(message: unknown): Promise<void>;
  receive(): Promise<unknown>;
}
