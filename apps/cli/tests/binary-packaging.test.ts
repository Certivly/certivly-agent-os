import { describe, it, expect } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

describe('AgentOS Binary & Installer Suite', () => {
  const rootDir = path.resolve(__dirname, '..', '..', '..');
  const binDir = path.join(rootDir, 'bin');
  const isWindows = process.platform === 'win32';
  const exePath = path.join(binDir, isWindows ? 'agentos.exe' : 'agentos');

  it('1. standalone native binary exists and executes --version', () => {
    expect(fs.existsSync(exePath)).toBe(true);
    const versionOutput = execSync(`"${exePath}" --version`, { encoding: 'utf-8' }).trim();
    expect(versionOutput).toBe('1.0.0');
  });

  it('2. standalone native binary executes --help and lists core commands', () => {
    const helpOutput = execSync(`"${exePath}" --help`, { encoding: 'utf-8' });
    expect(helpOutput).toContain('AgentOS Power CLI');
    expect(helpOutput).toContain('chat');
    expect(helpOutput).toContain('run');
    expect(helpOutput).toContain('desktop');
    expect(helpOutput).toContain('doctor');
    expect(helpOutput).toContain('models');
  });

  it('3. cryptographic SHA-256 checksums file is generated and valid', () => {
    const checksumFile = path.join(binDir, 'checksums.txt');
    expect(fs.existsSync(checksumFile)).toBe(true);
    const content = fs.readFileSync(checksumFile, 'utf-8').trim();
    const lines = content.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      expect(parts.length).toBe(2);
      const [expectedHash, fileName] = parts;
      const targetPath = path.join(binDir, fileName);
      expect(fs.existsSync(targetPath)).toBe(true);

      const targetContent = fs.readFileSync(targetPath);
      const calculatedHash = crypto.createHash('sha256').update(targetContent).digest('hex');
      expect(calculatedHash).toBe(expectedHash);
    }
  });

  it('4. cross-platform environment launcher wrappers exist in bin/', () => {
    expect(fs.existsSync(path.join(binDir, 'agentos.cmd'))).toBe(true);
    expect(fs.existsSync(path.join(binDir, 'agentos.ps1'))).toBe(true);
    expect(fs.existsSync(path.join(binDir, 'agentos'))).toBe(true);

    const cmd = fs.readFileSync(path.join(binDir, 'agentos.cmd'), 'utf-8');
    expect(cmd).toContain('agentos.exe');

    const ps1 = fs.readFileSync(path.join(binDir, 'agentos.ps1'), 'utf-8');
    expect(ps1).toContain('agentos.exe');

    const sh = fs.readFileSync(path.join(binDir, 'agentos'), 'utf-8');
    expect(sh).toContain('#!/usr/bin/env bash');
  });

  it('5. Windows PowerShell installer install.ps1 is valid and operational', () => {
    const ps1Installer = path.join(rootDir, 'install.ps1');
    expect(fs.existsSync(ps1Installer)).toBe(true);
    const content = fs.readFileSync(ps1Installer, 'utf-8');
    expect(content).toContain('$InstallDir');
    expect(content).toContain('[EnvironmentVariableTarget]::User');
    expect(content).toContain('Quickstart Commands');

    // Run dry/isolated install into temp directory with -NoPath
    const tempInstallDir = fs.mkdtempSync(path.join(rootDir, '.agentos', 'test-installer-'));
    try {
      const installRes = execSync(
        `powershell -ExecutionPolicy Bypass -File "${ps1Installer}" -InstallDir "${tempInstallDir}" -NoPath`,
        { encoding: 'utf-8' }
      );
      expect(installRes).toContain('AgentOS successfully installed to');
      expect(fs.existsSync(path.join(tempInstallDir, 'agentos.exe'))).toBe(true);
      expect(fs.existsSync(path.join(tempInstallDir, 'agentos.cmd'))).toBe(true);
    } finally {
      fs.rmSync(tempInstallDir, { recursive: true, force: true });
    }
  });

  it('6. POSIX shell installer install.sh has valid syntax', () => {
    const shInstaller = path.join(rootDir, 'install.sh');
    expect(fs.existsSync(shInstaller)).toBe(true);
    const content = fs.readFileSync(shInstaller, 'utf-8');
    expect(content).toContain('INSTALL_DIR');
    expect(content).toContain('export PATH=');
    expect(content).toContain('Quickstart Commands');

    const syntaxCheck = execSync('bash -n install.sh', { cwd: rootDir, encoding: 'utf-8' });
    expect(syntaxCheck).toBe('');
  });

  it('7. Electron Desktop packaging config electron-builder.json is valid', () => {
    const builderConfig = path.join(rootDir, 'apps', 'desktop', 'electron-builder.json');
    expect(fs.existsSync(builderConfig)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(builderConfig, 'utf-8'));
    expect(parsed.appId).toBe('com.agentos.desktop');
    expect(parsed.productName).toBe('AgentOS Desktop');
    expect(parsed.directories.output).toBe('release');
    expect(parsed.win).toBeDefined();
    expect(parsed.mac).toBeDefined();
    expect(parsed.linux).toBeDefined();
  });
});
