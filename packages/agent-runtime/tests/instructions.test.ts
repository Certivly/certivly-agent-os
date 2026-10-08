import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { loadInstructionText, BASE_AGENT_SYSTEM_PROMPT } from '../src/loop/instructions';

describe('Instruction Loading', () => {
  const testRoot = path.join(__dirname, '.tmp-instructions-test');

  beforeEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should include core guidelines in BASE_AGENT_SYSTEM_PROMPT', () => {
    expect(BASE_AGENT_SYSTEM_PROMPT).toContain('Explore');
    expect(BASE_AGENT_SYSTEM_PROMPT).toContain('targeted edits');
    expect(BASE_AGENT_SYSTEM_PROMPT).toContain('exit code 0');
  });

  it('should load root AGENTS.md and .github/copilot-instructions.md', async () => {
    fs.writeFileSync(path.join(testRoot, 'AGENTS.md'), '# Root Agents Instructions');
    const githubDir = path.join(testRoot, '.github');
    fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# Copilot Rules');

    const loaded = await loadInstructionText(testRoot);
    expect(loaded).toContain('Root Agents Instructions');
    expect(loaded).toContain('Copilot Rules');
  });

  it('should load nested AGENTS.md when touched files are in subdirectories', async () => {
    const pkgDir = path.join(testRoot, 'packages', 'foo');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'AGENTS.md'), '# Foo Package Instructions');

    const loaded = await loadInstructionText(testRoot, ['packages/foo/src/index.ts']);
    expect(loaded).toContain('Foo Package Instructions');
  });

  it('should reject or ignore touched files outside workspace root', async () => {
    const outsideDir = path.join(__dirname, '.tmp-outside-dir');
    if (!fs.existsSync(outsideDir)) {
      fs.mkdirSync(outsideDir, { recursive: true });
    }
    fs.writeFileSync(path.join(outsideDir, 'AGENTS.md'), '# Secret Outside Info');

    try {
      const loaded = await loadInstructionText(testRoot, [path.join(outsideDir, 'file.ts')]);
      expect(loaded).not.toContain('Secret Outside Info');
    } finally {
      try {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should cap long instructions at 20000 characters with a truncation marker', async () => {
    const longContent = 'A'.repeat(25000);
    fs.writeFileSync(path.join(testRoot, 'AGENTS.md'), longContent);

    const loaded = await loadInstructionText(testRoot);
    expect(loaded.length).toBeLessThanOrEqual(20000);
    expect(loaded).toContain('[... truncated instruction text ...]');
  });
});
