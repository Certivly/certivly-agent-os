import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ServiceCommand } from '../src/cli/commands/service';

describe('agentos service Command', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-service-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('reports stopped status when daemon is not running', async () => {
    const cmd = new ServiceCommand();
    const status = await cmd.getStatus(59999);
    expect(status.running).toBe(false);
    expect(status.port).toBe(59999);
  });

  it('cleans up stale pid file when process is not alive', async () => {
    const cmd = new ServiceCommand();
    const dotAgentos = path.join(tempDir, '.agentos');
    fs.mkdirSync(dotAgentos, { recursive: true });
    const pidFile = path.join(dotAgentos, 'daemon.pid');
    fs.writeFileSync(pidFile, '99999999', 'utf-8');

    const status = await cmd.getStatus(59998);
    expect(status.running).toBe(false);
    expect(fs.existsSync(pidFile)).toBe(false);
  });
});
