import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  Verification,
  runVerification,
  formatVerificationFailure,
  findNearestPackageJson,
} from '../src/verification/Verification';

describe('Truthful Verification Module', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-verify-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. passing script -> verified', async () => {
    const pkgJson = {
      name: 'test-app',
      scripts: {
        typecheck: 'echo typecheck passed',
        test: 'echo test passed',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));

    const result = await runVerification({
      workspaceRoot: tempDir,
      executor: async (cmd) => {
        return { exitCode: 0, stdout: `${cmd} ok`, stderr: '' };
      },
    });

    expect(result.verdict).toBe('verified');
    const passed = result.checks.filter((c) => c.status === 'passed');
    expect(passed.length).toBe(2);
    expect(passed.map((c) => c.name)).toEqual(['typecheck', 'test']);
  });

  it('2. failing script -> failed', async () => {
    const pkgJson = {
      name: 'test-app',
      scripts: {
        typecheck: 'tsc --noEmit',
        test: 'bun test',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));

    const result = await runVerification({
      workspaceRoot: tempDir,
      executor: async (cmd) => {
        if (cmd.includes('typecheck')) {
          return { exitCode: 1, stdout: '', stderr: 'TS2322: Type number is not assignable to string.' };
        }
        return { exitCode: 0, stdout: 'tests passed', stderr: '' };
      },
    });

    expect(result.verdict).toBe('failed');
    const failed = result.checks.find((c) => c.name === 'typecheck');
    expect(failed).toBeDefined();
    expect(failed?.status).toBe('failed');
    expect(failed?.exitCode).toBe(1);
    expect(failed?.outputTail).toContain('TS2322');
  });

  it('3. no scripts -> unverified', async () => {
    const pkgJson = {
      name: 'test-app',
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));

    const result = await runVerification({
      workspaceRoot: tempDir,
      executor: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });

    expect(result.verdict).toBe('unverified');
    expect(result.checks.every((c) => c.status === 'skipped')).toBe(true);
    // Never mark all-skipped as verified
    expect(result.verdict).not.toBe('verified');
  });

  it('3b. no package.json -> unverified', async () => {
    const emptySubdir = path.join(tempDir, 'no-pkg');
    fs.mkdirSync(emptySubdir);

    // Ensure no parent package.json is picked up from os.tmpdir
    const result = await runVerification({
      workspaceRoot: emptySubdir,
      checks: ['test'],
    });

    // If tmpdir has no package.json, it's unverified
    // (If findNearestPackageJson finds something above tmpdir, test checks logic)
    expect(['unverified', 'failed']).toContain(result.verdict);
  });

  it('4. missing lint alone does not fail', async () => {
    const pkgJson = {
      name: 'test-app',
      scripts: {
        test: 'echo tests pass',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));

    const result = await runVerification({
      workspaceRoot: tempDir,
      executor: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
    });

    // typecheck, lint, build are missing and skipped
    // test ran and passed
    expect(result.verdict).toBe('verified');
    const lintCheck = result.checks.find((c) => c.name === 'lint');
    expect(lintCheck).toBeDefined();
    expect(lintCheck?.status).toBe('skipped');
    expect(lintCheck?.reason).toContain("Script 'lint' not found");
  });

  it('5. failed command output tail captured', async () => {
    const pkgJson = {
      name: 'test-app',
      scripts: {
        build: 'build-tool',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));

    const longError = 'x'.repeat(3000) + '\nSyntaxError: Unexpected token in bundle.js:42:10';

    const result = await runVerification({
      workspaceRoot: tempDir,
      executor: async () => ({ exitCode: 2, stdout: '', stderr: longError }),
    });

    expect(result.verdict).toBe('failed');
    const buildCheck = result.checks.find((c) => c.name === 'build');
    expect(buildCheck).toBeDefined();
    expect(buildCheck?.status).toBe('failed');
    expect(buildCheck?.exitCode).toBe(2);
    expect(buildCheck?.outputTail?.length).toBeLessThanOrEqual(2000);
    expect(buildCheck?.outputTail).toContain('SyntaxError: Unexpected token in bundle.js:42:10');

    // Also check formatVerificationFailure formatting
    const feedback = formatVerificationFailure(result);
    expect(feedback).toContain('Verification failed:');
    expect(feedback).toContain('build');
    expect(feedback).toContain('SyntaxError: Unexpected token');
  });

  it('6. finds package.json in parent directories', () => {
    const nested = path.join(tempDir, 'src', 'deep', 'folder');
    fs.mkdirSync(nested, { recursive: true });
    const pkgPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'parent' }));

    const found = findNearestPackageJson(nested);
    expect(found).toBe(pkgPath);
  });
});
