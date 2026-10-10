import { spawn, type ChildProcess } from 'child_process';
import type { McpStdioConfig, McpJsonRpcRequest, McpJsonRpcResponse, McpJsonRpcNotification } from './types';

export class StdioTransport {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<string | number, {
    resolve: (res: McpJsonRpcResponse) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private stdoutBuffer: string = '';
  private isClosed: boolean = false;

  constructor(
    private config: McpStdioConfig,
    private timeoutMs: number = 30_000
  ) {}

  public async start(): Promise<void> {
    if (this.process) return;

    const env = {
      ...process.env,
      ...(this.config.env || {}),
    };

    this.process = spawn(this.config.command, this.config.args || [], {
      cwd: this.config.cwd || process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.handleData(chunk.toString('utf-8'));
    });

    this.process.stderr?.on('data', (_chunk: Buffer) => {
      // Diagnostic logging could be enabled here if needed
    });

    this.process.on('error', (err) => {
      this.cleanup(new Error(`MCP server process error: ${err.message}`));
    });

    this.process.on('close', (code) => {
      this.cleanup(new Error(`MCP server process exited with code ${code}`));
    });
  }

  public async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.isClosed || !this.process?.stdin) {
      throw new Error('MCP Stdio transport is not connected');
    }

    const id = Date.now() + Math.floor(Math.random() * 10000);
    const request: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request '${method}' timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timer);
          if (response.error) {
            reject(new Error(`MCP Error ${response.error.code}: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });

      const serialized = JSON.stringify(request) + '\n';
      this.process?.stdin?.write(serialized, 'utf-8');
    });
  }

  public async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    if (this.isClosed || !this.process?.stdin) {
      return;
    }

    const notification: McpJsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(notification) + '\n', 'utf-8');
  }

  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    this.cleanup(new Error('MCP transport closed'));

    if (this.process) {
      try {
        this.process.kill('SIGTERM');
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            try {
              this.process.kill('SIGKILL');
            } catch (err: unknown) {
              const _msg = err instanceof Error ? err.message : String(err);
            }
          }
        }, 1000);
      } catch (err: unknown) {
        const _msg = err instanceof Error ? err.message : String(err);
      }
      this.process = null;
    }
  }

  private handleData(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed) as McpJsonRpcResponse;
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
          const handler = this.pendingRequests.get(message.id);
          this.pendingRequests.delete(message.id);
          handler?.resolve(message);
        }
      } catch (err: unknown) {
        // Non-JSON stdout lines (e.g. server banner or diagnostics)
        const _msg = err instanceof Error ? err.message : String(err);
      }
    }
  }

  private cleanup(err: Error): void {
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(err);
    }
    this.pendingRequests.clear();
  }
}
