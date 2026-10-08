import { describe, it, expect } from 'bun:test';
import * as path from 'path';
import * as os from 'os';
import {
  createDefaultExecutor,
  runVerification,
} from '../src/verification/Verification';

describe('Action 6-11: Verification Executor Hardening', () => {
  it('1. enforces timeout on hanging commands', async () => {
    const executor = createDefaultExecutor({ timeoutMs: 200 });
    // Use bun to run a script that sleeps for 2 seconds
    const sleepCmd = process.platform === 'win32'
      ? 'powershell -NoProfile -Command "Start-Sleep -Milliseconds 2000"'
      : 'sleep 2';

    const start = Date.now();
    const result = await executor(sleepCmd, os.tmpdir());
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1500);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/timed out/i);
  });

  it('2. caps large outputs to prevent memory exhaustion', async () => {
    const maxBytes = 1024; // 1KB cap
    const executor = createDefaultExecutor({ maxOutputBytes: maxBytes });

    // Command that prints lots of data
    const spamCmd = process.platform === 'win32'
      ? 'powershell -NoProfile -Command "1..1000 | ForEach-Object { Write-Output \'abcdefghijklmnopqrstuvwxyz0123456789\' }"'
      : 'python3 -c "print(\'a\' * 50000)" 2>/dev/null || node -e "console.log(\'a\'.repeat(50000))"';

    const result = await executor(spamCmd, os.tmpdir());
    const totalOutput = result.stdout + result.stderr;

    expect(totalOutput.length).toBeLessThan(maxBytes + 200); // capped with truncation message
    expect(totalOutput).toContain('[output truncated');
  });

  it('3. injects non-interactive environment variables', async () => {
    const executor = createDefaultExecutor();
    const printEnvCmd = process.platform === 'win32'
      ? 'powershell -NoProfile -Command "Write-Output CI=$env:CI; Write-Output GIT_TERMINAL_PROMPT=$env:GIT_TERMINAL_PROMPT"'
      : 'echo "CI=$CI"; echo "GIT_TERMINAL_PROMPT=$GIT_TERMINAL_PROMPT"';

    const result = await executor(printEnvCmd, os.tmpdir());
    expect(result.stdout).toContain('CI=true');
    expect(result.stdout).toContain('GIT_TERMINAL_PROMPT=0');
  });

  it('4. ignores stdin so interactive prompts do not hang', async () => {
    const executor = createDefaultExecutor({ timeoutMs: 1500 });
    // Reading from stdin should return immediately with EOF because stdin is 'ignore'
    const readStdinCmd = process.platform === 'win32'
      ? 'powershell -NoProfile -Command "$line = [Console]::In.ReadLine(); Write-Output [READ:$line]"'
      : 'cat';

    const start = Date.now();
    const result = await executor(readStdinCmd, os.tmpdir());
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
    expect(result.exitCode).toBe(0);
  });
});
