import { McpTransport } from './McpTransport';

export class StdioTransport implements McpTransport {
  constructor(private command: string, private args: string[]) {}

  async connect(): Promise<void> {
    // In a real implementation this would spawn a child process
  }

  async disconnect(): Promise<void> {
    // Kill the process
  }

  async send(message: unknown): Promise<unknown> {
    // Write to stdin, read from stdout
    // MOCK response for now
    return { id: (message as any).id, result: { success: true } };
  }
}
