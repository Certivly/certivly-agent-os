import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { PackageDryRun } from '../src/package/PackageDryRun';

describe('Action 3.16: Packaging And Release Check', () => {
  const rootDir = path.resolve(__dirname, '..', '..', '..');
  const distBin = path.join(rootDir, 'apps', 'cli', 'dist', 'index.js');

  it('1. built CLI help works', () => {
    // If not built yet, run build
    if (!fs.existsSync(distBin)) {
      spawnSync('bun', ['run', 'build'], { cwd: rootDir });
    }

    const res = spawnSync('bun', [distBin, '--help'], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('AgentOS Power CLI');
    expect(res.stdout).toContain('doctor');
    expect(res.stdout).toContain('bench');
    expect(res.stdout).toContain('chat');
  });

  it('2. version command works', () => {
    const res = spawnSync('bun', [distBin, '--version'], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('1.0.0');
  });

  it('3. doctor command exits correctly', () => {
    const res = spawnSync('bun', [distBin, 'doctor', 'providers'], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Provider Health & Diagnostics');
  });

  it('4. package dry run includes expected files', () => {
    const check = PackageDryRun.checkPackage(rootDir);
    expect(check.allValid).toBe(true);
    expect(check.binaryExists).toBe(true);
    expect(check.standaloneBinExists).toBe(true);
    expect(check.installersExist).toBe(true);
    expect(check.desktopConfigExists).toBe(true);
    expect(check.configSchemaExists).toBe(true);
    expect(check.smokeTasksExist).toBe(true);
    expect(check.docsExist).toBe(true);
    expect(check.changelogExists).toBe(true);
    expect(check.missing.length).toBe(0);

    const report = PackageDryRun.formatReport(check);
    expect(report).toContain('✓ PASS');
    expect(report).toContain('All required distribution assets are verified.');
  });

  it('5. missing required asset fails dry run', () => {
    const simulatedMissing = PackageDryRun.checkPackage(rootDir, {
      binaryExists: false,
      changelogExists: false,
    });

    expect(simulatedMissing.allValid).toBe(false);
    expect(simulatedMissing.missing).toContain('Built binary (apps/cli/dist/index.js)');
    expect(simulatedMissing.missing).toContain('Changelog (CHANGELOG.md)');

    const report = PackageDryRun.formatReport(simulatedMissing);
    expect(report).toContain('✗ FAIL');
    expect(report).toContain('Missing Required Assets');
  });
});
