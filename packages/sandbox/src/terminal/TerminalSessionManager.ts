import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';

export interface TerminalSessionConfig {
  id: string;
  cwd: string;
  env?: Record<string, string>;
  shell?: string;
}

export interface TerminalCapture {
  sessionId: string;
  screenText: string;
  totalLines: number;
  timestamp: number;
}

export interface ActiveSession {
  id: string;
  process: ChildProcess;
  cwd: string;
  buffer: string[];
  lastOutputTime: number;
  isAlive: boolean;
}

export class TerminalSessionManager {
  private static instance: TerminalSessionManager;
  private sessions: Map<string, ActiveSession> = new Map();

  public static getInstance(): TerminalSessionManager {
    if (!TerminalSessionManager.instance) {
      TerminalSessionManager.instance = new TerminalSessionManager();
    }
    return TerminalSessionManager.instance;
  }

  public createSession(config: TerminalSessionConfig): ActiveSession {
    if (this.sessions.has(config.id)) {
      const existing = this.sessions.get(config.id)!;
      if (existing.isAlive) return existing;
    }

    const isWindows = process.platform === 'win32';
    const shell = config.shell || (isWindows ? 'cmd.exe' : 'sh');

    const proc = spawn(shell, [], {
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const session: ActiveSession = {
      id: config.id,
      process: proc,
      cwd: config.cwd,
      buffer: [],
      lastOutputTime: Date.now(),
      isAlive: true,
    };

    const appendChunk = (chunk: Buffer | string) => {
      const text = chunk.toString();
      session.lastOutputTime = Date.now();
      const cleanText = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); // strip ANSI escapes
      for (const line of cleanText.split('\n')) {
        session.buffer.push(line);
      }
      // Bound buffer to last 1000 lines
      if (session.buffer.length > 1000) {
        session.buffer = session.buffer.slice(session.buffer.length - 1000);
      }
    };

    proc.stdout?.on('data', appendChunk);
    proc.stderr?.on('data', appendChunk);

    proc.on('close', () => {
      session.isAlive = false;
    });

    proc.on('error', () => {
      session.isAlive = false;
    });

    this.sessions.set(config.id, session);
    return session;
  }

  public getSession(id: string): ActiveSession | undefined {
    return this.sessions.get(id);
  }

  public async send(
    id: string,
    text: string,
    pressEnter: boolean = true
  ): Promise<void> {
    const session = this.sessions.get(id);
    if (!session || !session.isAlive) {
      throw new Error(`Terminal session "${id}" is not active`);
    }

    const payload = pressEnter ? `${text}\n` : text;
    session.process.stdin?.write(payload);
  }

  public async sendControl(
    id: string,
    key: 'ctrl-c' | 'ctrl-d' | 'escape' | 'tab'
  ): Promise<void> {
    const session = this.sessions.get(id);
    if (!session || !session.isAlive) {
      throw new Error(`Terminal session "${id}" is not active`);
    }

    switch (key) {
      case 'ctrl-c':
        session.process.stdin?.write('\x03');
        break;
      case 'ctrl-d':
        session.process.stdin?.write('\x04');
        break;
      case 'escape':
        session.process.stdin?.write('\x1b');
        break;
      case 'tab':
        session.process.stdin?.write('\t');
        break;
    }
  }

  public captureScreen(id: string, maxLines: number = 80): TerminalCapture {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Terminal session "${id}" not found`);
    }

    const recentLines = session.buffer.slice(Math.max(0, session.buffer.length - maxLines));
    const screenText = recentLines.join('\n').trim();

    return {
      sessionId: id,
      screenText,
      totalLines: session.buffer.length,
      timestamp: Date.now(),
    };
  }

  public async waitIdle(
    id: string,
    options?: { maxWaitMs?: number; idleStabilityMs?: number }
  ): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || !session.isAlive) return true;

    const maxWaitMs = options?.maxWaitMs ?? 10_000;
    const idleStabilityMs = options?.idleStabilityMs ?? 300;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (!session.isAlive) return true;
      if (Date.now() - session.lastOutputTime >= idleStabilityMs) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return false;
  }

  public destroySession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.process.kill();
      } catch (_err: unknown) {
        // Ignored if process was already terminated
      }
      session.isAlive = false;
      this.sessions.delete(id);
    }
  }

  public destroyAll(): void {
    for (const [id] of this.sessions) {
      this.destroySession(id);
    }
  }
}

export const terminalSessionManager = TerminalSessionManager.getInstance();
