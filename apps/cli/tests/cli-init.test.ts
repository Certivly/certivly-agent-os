import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectProject, generateAgentsMarkdown, runInit } from '../src/cli/commands/init';

describe('agentos init Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-init-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('detects a Node.js project with package.json and scripts', () => {
    const pkg = {
      name: 'my-web-app',
      scripts: {
        test: 'bun test',
        build: 'bun build ./src/index.ts',
        lint: 'eslint .',
        dev: 'bun --watch src/index.ts',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg), 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'bun.lock'), '', 'utf-8');

    const meta = detectProject(tempDir);
    expect(meta.name).toBe('my-web-app');
    expect(meta.ecosystem).toBe('node');
    expect(meta.packageManager).toBe('bun');
    expect(meta.testCommand).toBe('bun test');
    expect(meta.buildCommand).toBe('bun run build');
    expect(meta.lintCommand).toBe('bun run lint');
    expect(meta.devCommand).toBe('bun run dev');
  });

  it('detects a Python project with pyproject.toml', () => {
    fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), '[project]\nname = "py-agent"', 'utf-8');
    const meta = detectProject(tempDir);
    expect(meta.ecosystem).toBe('python');
    expect(meta.packageManager).toBe('pip');
    expect(meta.lintCommand).toBe('ruff check .');
  });

  it('detects a Rust project with Cargo.toml', () => {
    fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "rust-agent"', 'utf-8');
    const meta = detectProject(tempDir);
    expect(meta.ecosystem).toBe('rust');
    expect(meta.testCommand).toBe('cargo test');
    expect(meta.buildCommand).toBe('cargo build');
  });

  it('generates rich AGENTS.md document', () => {
    const meta = {
      name: 'demo-app',
      ecosystem: 'node' as const,
      packageManager: 'bun' as const,
      testCommand: 'bun test',
      buildCommand: 'bun run build',
      hasGit: true,
    };
    const md = generateAgentsMarkdown(meta);
    expect(md).toContain('# demo-app - Agent Operating Guidelines');
    expect(md).toContain('- **Test**: `bun test`');
    expect(md).toContain('- **Build**: `bun run build`');
    expect(md).toContain('Verification-First');
  });

  it('runs full init scaffolding successfully', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'scaffold-test', scripts: { test: 'vitest' } }),
      'utf-8'
    );

    const res = runInit({ cwd: tempDir, model: 'deepseek-coder' });
    expect(res.projectRoot).toBe(tempDir);
    expect(res.metadata.name).toBe('scaffold-test');
    expect(res.createdFiles).toContain('.agentos/config.json');
    expect(res.createdFiles).toContain('AGENTS.md');
    expect(res.createdFiles).toContain('.agents/rules/coding-style.md');
    expect(res.createdFiles).toContain('.agents/subagents/project-reviewer.json');

    // Verify config file
    const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.agentos', 'config.json'), 'utf-8'));
    expect(config.activeModel).toBe('deepseek-coder');

    // Idempotent run skips files
    const secondRun = runInit({ cwd: tempDir });
    expect(secondRun.skippedFiles.length).toBeGreaterThan(0);
  });
});
