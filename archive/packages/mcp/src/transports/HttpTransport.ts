import { McpTransport } from './McpTransport';

export class HttpTransport implements McpTransport {
  constructor(private endpoint: string) {}

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async send(message: unknown): Promise<unknown> {
    // MOCK fetch for now
    return { id: (message as any).id, result: { success: true } };
  }
}
