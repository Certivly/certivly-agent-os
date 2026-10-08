import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { InstructionLoader } from '../src/loop/instructions';

describe('InstructionLoader Tests (Action 5-02)', () => {
  const testRoot = path.join(__dirname, '.tmp-instruction-loader-test');

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

  it('1. Root AGENTS.md is loaded', () => {
    fs.writeFileSync(path.join(testRoot, 'AGENTS.md'), '# Root Instructions');
    const loaded = InstructionLoader.load(testRoot);
    expect(loaded.rootInstructions).toContain('# Root Instructions');
    expect(loaded.copilotInstructions).toBeNull();
  });

  it('2. Copilot instructions are loaded', () => {
    const githubDir = path.join(testRoot, '.github');
    fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# Copilot Guidance');

    const loaded = InstructionLoader.load(testRoot);
    expect(loaded.copilotInstructions).toContain('# Copilot Guidance');
    expect(loaded.rootInstructions).toBeNull();
  });

  it('3. Missing files return null', () => {
    const loaded = InstructionLoader.load(testRoot);
    expect(loaded.rootInstructions).toBeNull();
    expect(loaded.copilotInstructions).toBeNull();
    expect(loaded.nestedInstructions).toEqual([]);
  });

  it('4. Nested AGENTS.md resolves nearest-first without returning root', () => {
    fs.writeFileSync(path.join(testRoot, 'AGENTS.md'), '# Root Level Instructions');

    const fooDir = path.join(testRoot, 'src', 'foo');
    fs.mkdirSync(fooDir, { recursive: true });
    fs.writeFileSync(path.join(fooDir, 'AGENTS.md'), '# Foo Directory Instructions');

    const nested = InstructionLoader.loadForFile('src/foo/bar.ts', testRoot);
    expect(nested).toContain('# Foo Directory Instructions');
    expect(nested).not.toContain('# Root Level Instructions');

    // If file is in a folder without AGENTS.md, walk up:
    const subFooDir = path.join(fooDir, 'deep');
    fs.mkdirSync(subFooDir, { recursive: true });
    const subNested = InstructionLoader.loadForFile('src/foo/deep/baz.ts', testRoot);
    expect(subNested).toContain('# Foo Directory Instructions');

    // If file is directly under src and src has no AGENTS.md, root AGENTS.md should NOT be returned
    const noNested = InstructionLoader.loadForFile('src/other.ts', testRoot);
    expect(noNested).toBeNull();
  });

  it('5. Oversized file is truncated', () => {
    const longContent = 'X'.repeat(9000);
    fs.writeFileSync(path.join(testRoot, 'AGENTS.md'), longContent);

    const loaded = InstructionLoader.load(testRoot);
    expect(loaded.rootInstructions).toBeDefined();
    expect(loaded.rootInstructions).toContain('...(truncated');
    expect(loaded.rootInstructions?.length).toBeLessThan(8200);
  });

  it('buildSystemPromptSection correctly combines instructions', () => {
    const section = InstructionLoader.buildSystemPromptSection({
      rootInstructions: 'Root rules',
      copilotInstructions: 'Copilot rules',
      nestedInstructions: [{ path: 'src/foo', content: 'Nested rules' }],
    });
    expect(section).toContain('## Project Instructions (AGENTS.md)');
    expect(section).toContain('Root rules');
    expect(section).toContain('## Copilot Instructions (.github/copilot-instructions.md)');
    expect(section).toContain('Copilot rules');
    expect(section).toContain('## Nested Instructions (src/foo)');
    expect(section).toContain('Nested rules');
  });
});
