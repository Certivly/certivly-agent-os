export interface ConsoleLogEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: any[];
  timestamp: string;
}

export class ConsoleUtils {
  private logs: ConsoleLogEntry[] = [];
  private maxLogs: number = 1000;

  public log(...args: any[]): void {
    this.record('log', args);
  }

  public info(...args: any[]): void {
    this.record('info', args);
  }

  public warn(...args: any[]): void {
    this.record('warn', args);
  }

  public error(...args: any[]): void {
    this.record('error', args);
  }

  public debug(...args: any[]): void {
    this.record('debug', args);
  }

  public dir(obj: any): void {
    this.record('log', [obj]);
  }

  public table(data: any): void {
    this.record('log', [data]);
  }

  private record(level: ConsoleLogEntry['level'], args: any[]): void {
    if (this.logs.length >= this.maxLogs) {
      this.logs.shift();
    }
    this.logs.push({
      level,
      args,
      timestamp: new Date().toISOString(),
    });
  }

  public getLogs(): ConsoleLogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
  }

  public formatOutput(): string {
    return this.logs
      .map(l => `[${l.level.toUpperCase()}] ${l.args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`)
      .join('\n');
  }
}
