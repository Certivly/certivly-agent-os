import { McpTransport } from './McpTransport';

export class SseTransport implements McpTransport {
  constructor(private url: string) {}

  async connect(): Promise<void> {
    // Setup EventSource
  }

  async disconnect(): Promise<void> {
    // Close EventSource
  }

  async send(message: unknown): Promise<unknown> {
    // Post to endpoint, receive via SSE
    return { id: (message as any).id, result: { success: true } };
  }
}
