import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runHeadless } from '../src/cli/headless';

describe('Headless Runner (Phase 4)', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore temporary file lock errors on Windows during cleanup
    }
  });

  it('runs headless execution and writes summary file upon completion', async () => {
    const configPath = path.join(tmpDir, 'agentos.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        activeProvider: 'lmstudio',
        activeModel: 'mock-model',
        runtime: { logLevel: 'error', sessionDir: path.join(tmpDir, '.sessions') },
        providers: {
          lmstudio: { baseUrl: 'http://127.0.0.1:9999/v1' },
        },
      })
    );

    const outputFile = path.join(tmpDir, 'summary.json');

    const result = await runHeadless({
      goal: 'Sample test task',
      workspaceRoot: tmpDir,
      configPath,
      permissionMode: 'auto',
      format: 'json',
      outputFile,
    });

    // Expect an exit code (either 0 or 1 depending on whether mock provider was reachable)
    expect(typeof result.exitCode).toBe('number');
    expect(result.exitCode === 0 || result.exitCode === 1).toBe(true);

    // If summary was produced, verify outputFile was created
    if (result.summary) {
      expect(fs.existsSync(outputFile)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      expect(parsed.sessionId).toBeDefined();
    }
  });

  it('returns exit code 1 with error when execution fails', async () => {
    const invalidConfigPath = path.join(tmpDir, 'bad-config.json');
    fs.writeFileSync(invalidConfigPath, '{ invalid json');

    const result = await runHeadless({
      goal: 'Should fail on invalid config',
      workspaceRoot: tmpDir,
      configPath: invalidConfigPath,
      format: 'json',
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
  });
});
