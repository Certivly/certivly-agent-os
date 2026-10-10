import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

describe('AgentOS Electron & React Desktop App Suite', () => {
  const desktopRoot = path.resolve(__dirname, '..');
  const distDir = path.join(desktopRoot, 'dist');

  it('1. builds complete Electron main bundle (dist/main/index.js)', () => {
    const mainFile = path.join(distDir, 'main', 'index.js');
    expect(fs.existsSync(mainFile)).toBe(true);
    const stat = fs.statSync(mainFile);
    expect(stat.size).toBeGreaterThan(1000);
    const content = fs.readFileSync(mainFile, 'utf-8');
    expect(content).toContain('DesktopServer');
    expect(content).toContain('createMainWindow');
  });

  it('2. builds complete Electron preload bridge (dist/preload/index.js)', () => {
    const preloadFile = path.join(distDir, 'preload', 'index.js');
    expect(fs.existsSync(preloadFile)).toBe(true);
    const content = fs.readFileSync(preloadFile, 'utf-8');
    expect(content).toContain('contextBridge');
    expect(content).toContain('agentos');
    expect(content).toContain('desktop:select-directory');
    expect(content).toContain('desktop:get-server-url');
  });

  it('3. builds React 19 production bundle (dist/renderer/main.js & main.css)', () => {
    const rendererDir = path.join(distDir, 'renderer');
    const jsFile = path.join(rendererDir, 'main.js');
    const cssFile = path.join(rendererDir, 'main.css');
    const htmlFile = path.join(rendererDir, 'index.html');

    expect(fs.existsSync(jsFile)).toBe(true);
    expect(fs.existsSync(cssFile)).toBe(true);
    expect(fs.existsSync(htmlFile)).toBe(true);

    const htmlContent = fs.readFileSync(htmlFile, 'utf-8');
    expect(htmlContent).toContain('AgentOS Desktop');
    expect(htmlContent).toContain('main.js');

    const jsContent = fs.readFileSync(jsFile, 'utf-8');
    // Verify React 19 components are bundled
    expect(jsContent).toContain('Key Vault');
    expect(jsContent).toContain('Test Connection');
  });

  it('4. exposes Electron launcher and helper APIs', async () => {
    const { launchElectronApp } = await import('../src/launcher');
    expect(typeof launchElectronApp).toBe('function');
  });
});
