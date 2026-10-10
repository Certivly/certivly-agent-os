import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { InstructionLoader, loadInstructionText } from '../src/loop/instructions';

describe('InstructionLoader (Multi-Harness Discovery: Qwen Code, Claude Code, Cursor, Gemini)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-instructions-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_err: unknown) {
      // Cleanup best effort
    }
  });

  it('discovers and loads CLAUDE.md when present in workspace root', () => {
    const claudeMd = path.join(tempDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMd, '# Claude Code Rules\n- Use strict typescript\n- Run tests with bun test');

    const loaded = InstructionLoader.load(tempDir);
    expect(loaded.customInstructions).toBeDefined();
    expect(loaded.customInstructions?.length).toBeGreaterThan(0);
    const claudeEntry = loaded.customInstructions?.find(c => c.source.includes('CLAUDE.md'));
    expect(claudeEntry).toBeDefined();
    expect(claudeEntry?.content).toContain('# Claude Code Rules');

    const section = InstructionLoader.buildSystemPromptSection(loaded);
    expect(section).toContain('Claude Code Instructions (CLAUDE.md)');
    expect(section).toContain('Use strict typescript');
  });

  it('discovers and loads .cursorrules when present', () => {
    const cursorRules = path.join(tempDir, '.cursorrules');
    fs.writeFileSync(cursorRules, 'Prefer functional programming and immutable data structures.');

    const loaded = InstructionLoader.load(tempDir);
    const cursorEntry = loaded.customInstructions?.find(c => c.source.includes('.cursorrules'));
    expect(cursorEntry).toBeDefined();
    expect(cursorEntry?.content).toContain('immutable data structures');
  });

  it('discovers and loads QWEN.md when present', () => {
    const qwenMd = path.join(tempDir, 'QWEN.md');
    fs.writeFileSync(qwenMd, '# Qwen Code Guidelines\n- Verify tests after every modification.');

    const loaded = InstructionLoader.load(tempDir);
    const qwenEntry = loaded.customInstructions?.find(c => c.source.includes('QWEN.md'));
    expect(qwenEntry).toBeDefined();
    expect(qwenEntry?.content).toContain('# Qwen Code Guidelines');
  });

  it('loads multiple instruction sources simultaneously with correct formatting', async () => {
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), 'Standard agents rule');
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), 'Claude rule');
    fs.writeFileSync(path.join(tempDir, 'QWEN.md'), 'Qwen rule');

    const loaded = InstructionLoader.load(tempDir);
    expect(loaded.rootInstructions).toContain('Standard agents rule');
    expect(loaded.customInstructions?.length).toBe(2);

    const section = InstructionLoader.buildSystemPromptSection(loaded);
    expect(section).toContain('## Project Instructions (AGENTS.md)');
    expect(section).toContain('## Claude Code Instructions (CLAUDE.md)');
    expect(section).toContain('## Qwen Code Instructions (QWEN.md)');

    const text = await loadInstructionText(tempDir);
    expect(text).toContain('Standard agents rule');
    expect(text).toContain('Claude rule');
    expect(text).toContain('Qwen rule');
  });
});
