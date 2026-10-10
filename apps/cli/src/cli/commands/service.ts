import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

export interface ServiceStatus {
  running: boolean;
  pid?: number;
  port: number;
  host: string;
  uptimeSeconds?: number;
}

export class ServiceCommand {
  private getPidFilePath(): string {
    return path.join(process.cwd(), '.agentos', 'daemon.pid');
  }

  public async getStatus(port: number = 7070, host: string = '127.0.0.1'): Promise<ServiceStatus> {
    const pidFile = this.getPidFilePath();
    let pid: number | undefined;

    if (fs.existsSync(pidFile)) {
      try {
        const raw = fs.readFileSync(pidFile, 'utf-8').trim();
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) pid = parsed;
      } catch (_err) {
        // Fallback
      }
    }

    try {
      const res = await fetch(`http://${host}:${port}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          running: true,
          pid,
          port,
          host,
          uptimeSeconds: data.uptimeSeconds || 0,
        };
      }
    } catch (_err) {
      // Not reachable
    }

    // Check if PID is alive even if health endpoint is initializing
    if (pid) {
      try {
        process.kill(pid, 0); // test if process exists
        return {
          running: true,
          pid,
          port,
          host,
        };
      } catch (_err) {
        // Process is dead, clean stale pid file
        try {
          fs.unlinkSync(pidFile);
        } catch (_e) {
          // Best-effort: ignore pid cleanup error
        }
      }
    }

    return {
      running: false,
      port,
      host,
    };
  }

  public async startService(options: { port?: number; host?: string; background?: boolean; dataDir?: string }): Promise<{ success: boolean; message: string; pid?: number }> {
    const port = options.port || 7070;
    const host = options.host || '127.0.0.1';
    const status = await this.getStatus(port, host);

    if (status.running) {
      return {
        success: true,
        message: `AgentOS daemon is already running on ${host}:${port} (PID: ${status.pid || 'unknown'}).`,
        pid: status.pid,
      };
    }

    const dataDir = options.dataDir || path.join(os.homedir(), '.agentos', 'daemon');
    fs.mkdirSync(path.join(process.cwd(), '.agentos'), { recursive: true });

    if (options.background) {
      const cliEntry = path.resolve(__dirname, '../../index.ts');
      const child = spawn(process.execPath, [cliEntry, 'daemon', '--port', String(port), '--host', host, '--data-dir', dataDir], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      });

      child.unref();

      if (child.pid) {
        fs.writeFileSync(this.getPidFilePath(), String(child.pid), 'utf-8');
      }

      // Brief wait to verify startup
      await new Promise(r => setTimeout(r, 600));

      return {
        success: true,
        message: `Started AgentOS daemon in background on ${host}:${port} (PID: ${child.pid}).`,
        pid: child.pid,
      };
    } else {
      // Foreground mode
      const { DaemonBootstrap } = await import('@agent-os/daemon');
      const { daemon, lifecycle } = DaemonBootstrap.create({
        tcpPort: port,
        socketPath: '',
        dataDir,
        maxConcurrentRuntimes: 4,
      });

      fs.writeFileSync(this.getPidFilePath(), String(process.pid), 'utf-8');
      await lifecycle.startup();

      process.on('SIGINT', async () => {
        try {
          fs.unlinkSync(this.getPidFilePath());
        } catch (_e) {
          // Best-effort: ignore pid cleanup error
        }
        await lifecycle.shutdown();
        process.exit(0);
      });

      return {
        success: true,
        message: `AgentOS daemon running in foreground on ${host}:${port}. Press Ctrl+C to stop.`,
        pid: process.pid,
      };
    }
  }

  public async stopService(port: number = 7070, host: string = '127.0.0.1'): Promise<{ success: boolean; message: string }> {
    const status = await this.getStatus(port, host);
    const pidFile = this.getPidFilePath();

    if (!status.running && !status.pid) {
      if (fs.existsSync(pidFile)) {
        try {
          fs.unlinkSync(pidFile);
        } catch (_e) {
          // Best-effort: ignore pid cleanup error
        }
      }
      return { success: true, message: 'AgentOS daemon is not currently running.' };
    }

    if (status.pid) {
      try {
        process.kill(status.pid, 'SIGTERM');
      } catch (_err) {
        try {
          process.kill(status.pid, 'SIGKILL');
        } catch (_e) {
          // Best-effort: ignore kill error if process already terminated
        }
      }
    }

    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
      } catch (_e) {
        // Best-effort: ignore pid cleanup error
      }
    }

    return {
      success: true,
      message: `Stopped AgentOS daemon (PID: ${status.pid || 'unknown'}).`,
    };
  }

  public async restartService(options: { port?: number; host?: string; background?: boolean }): Promise<{ success: boolean; message: string }> {
    const port = options.port || 7070;
    const host = options.host || '127.0.0.1';
    await this.stopService(port, host);
    await new Promise(r => setTimeout(r, 400));
    const startRes = await this.startService({ port, host, background: options.background !== false });
    return startRes;
  }
}
