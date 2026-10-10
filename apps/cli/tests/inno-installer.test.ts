import { describe, it, expect } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';

describe('AgentOS Inno Setup GUI Installer Suite', () => {
  const rootDir = path.resolve(__dirname, '..', '..', '..');
  const installerDir = path.join(rootDir, 'installer');
  const issPath = path.join(installerDir, 'agentos.iss');
  const buildScriptPath = path.join(rootDir, 'scripts', 'build-inno-installer.ts');
  const outDir = path.join(rootDir, 'dist-installer');
  const setupExePath = path.join(outDir, 'AgentOS-Setup-1.0.0.exe');
  const packageJsonPath = path.join(rootDir, 'package.json');

  it('1. Inno Setup script installer/agentos.iss exists with proper sections', () => {
    expect(fs.existsSync(issPath)).toBe(true);
    const content = fs.readFileSync(issPath, 'utf-8');

    // Verify core Inno Setup sections
    expect(content).toContain('[Setup]');
    expect(content).toContain('[Languages]');
    expect(content).toContain('[Tasks]');
    expect(content).toContain('[Files]');
    expect(content).toContain('[Icons]');
    expect(content).toContain('[Run]');
    expect(content).toContain('[Code]');
  });

  it('2. Inno Setup script has correct application metadata and 64-bit config', () => {
    const content = fs.readFileSync(issPath, 'utf-8');

    expect(content).toContain('AppName={#MyAppName}');
    expect(content).toContain('AppVersion={#MyAppVersion}');
    expect(content).toContain('DefaultDirName={autopf}\\{#MyAppName}');
    expect(content).toContain('OutputBaseFilename=AgentOS-Setup-{#MyAppVersion}');
    expect(content).toContain('ArchitecturesInstallIn64BitMode=x64compatible');
    expect(content).toContain('PrivilegesRequired=lowest');
    expect(content).toContain('PrivilegesRequiredOverridesAllowed=dialog');
  });

  it('3. Inno Setup script configures PATH registration and Desktop shortcut tasks', () => {
    const content = fs.readFileSync(issPath, 'utf-8');

    expect(content).toContain('Name: "desktopicon"');
    expect(content).toContain('Name: "addtopath"');
    expect(content).toContain("WizardIsTaskSelected('addtopath')");
    expect(content).toContain('RegisterPath');
    expect(content).toContain('UnregisterPath');
    expect(content).toContain('ChangesEnvironment=yes');
  });

  it('4. Inno Setup script packages standalone CLI binary, wrappers, and desktop bundles', () => {
    const content = fs.readFileSync(issPath, 'utf-8');

    expect(content).toContain('Source: "..\\bin\\agentos.exe"');
    expect(content).toContain('Source: "..\\bin\\agentos.cmd"');
    expect(content).toContain('Source: "..\\bin\\agentos.ps1"');
    expect(content).toContain('Source: "..\\apps\\desktop\\dist\\*"');
    expect(content).toContain('Source: "..\\README.md"');
  });

  it('5. Automated build script scripts/build-inno-installer.ts is present and valid', () => {
    expect(fs.existsSync(buildScriptPath)).toBe(true);
    const content = fs.readFileSync(buildScriptPath, 'utf-8');

    expect(content).toContain('ISCC.exe');
    expect(content).toContain('build-binaries.ts');
    expect(content).toContain('desktop:build');
    expect(content).toContain('AgentOS-Setup-1.0.0.exe');
  });

  it('6. package.json scripts contain Inno installer commands', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(pkg.scripts['installer']).toBe('bun run scripts/build-inno-installer.ts');
    expect(pkg.scripts['installer:inno']).toBe('bun run scripts/build-inno-installer.ts');
  });

  it('7. Compiled Inno Setup executable AgentOS-Setup-1.0.0.exe is generated and is a valid PE binary', () => {
    expect(fs.existsSync(setupExePath)).toBe(true);
    const stats = fs.statSync(setupExePath);

    // Should be at least 20MB (includes standalone CLI + Electron desktop runtime bundle)
    expect(stats.size).toBeGreaterThan(20 * 1024 * 1024);

    // Verify Windows PE executable header: starts with 'MZ' (0x4D, 0x5A)
    const fd = fs.openSync(setupExePath, 'r');
    const buffer = Buffer.alloc(2);
    fs.readSync(fd, buffer, 0, 2, 0);
    fs.closeSync(fd);

    expect(buffer.toString('utf-8')).toBe('MZ');
  });
});
