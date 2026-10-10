import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SkillMiner, SessionHistoryItem } from '../src/skills/SkillMiner';
import { SkillRegistry } from '../src/skills/SkillRegistry';

describe('SkillMiner (Learnings from skill-optimizer & SkillOpt)', () => {
  let tempWs: string;
  let registry: SkillRegistry;
  let miner: SkillMiner;

  beforeEach(() => {
    tempWs = fs.mkdtempSync(path.join(os.tmpdir(), 'miner-ws-'));
    registry = new SkillRegistry({ workspaceRoot: tempWs });
    miner = new SkillMiner(registry);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWs, { recursive: true, force: true });
    } catch (_e) {
      // Cleanup temp workspace
    }
  });

  it('1. ignores unsuccessful or empty sessions', () => {
    const failedSession: SessionHistoryItem = {
      sessionId: 'sess-fail',
      userPrompt: 'Fix broken build',
      turns: 2,
      toolNames: ['run_command'],
      filesChanged: [],
      success: false,
    };

    const emptySession: SessionHistoryItem = {
      sessionId: 'sess-empty',
      userPrompt: 'Hello how are you',
      turns: 0,
      toolNames: [],
      filesChanged: [],
      success: true,
    };

    expect(miner.mineFromSession(failedSession)).toBeNull();
    expect(miner.mineFromSession(emptySession)).toBeNull();
  });

  it('2. mines structured candidate skill from verified multi-turn session', () => {
    const session: SessionHistoryItem = {
      sessionId: 'sess-123',
      userPrompt: 'Refactor csv parser to handle multiline quoted fields with unit tests',
      turns: 4,
      toolNames: ['read_file', 'edit_file', 'run_command', 'edit_file'],
      filesChanged: ['src/csv.ts', 'src/csv.test.ts'],
      success: true,
      errorsEncountered: ['AssertionError: expected newline handling to match RFC 4180'],
    };

    const candidate = miner.mineFromSession(session);
    expect(candidate).not.toBeNull();
    expect(candidate?.name).toContain('refactor');
    expect(candidate?.tools).toContain('read_file');
    expect(candidate?.tools).toContain('edit_file');
    expect(candidate?.tools).toContain('run_command');
    expect(candidate?.tags).toContain('testing');
    expect(candidate?.tags).toContain('refactoring');
    expect(candidate?.instructions).toContain('Target File Patterns');
    expect(candidate?.instructions).toContain('src/csv.ts');
    expect(candidate?.instructions).toContain('Recovery Strategies');
    expect(candidate?.instructions).toContain('RFC 4180');
  });

  it('3. mines and persists skill to workspace filesystem', () => {
    const session: SessionHistoryItem = {
      sessionId: 'sess-persist',
      userPrompt: 'Add retry wrapper with exponential backoff',
      turns: 3,
      toolNames: ['read_file', 'edit_file', 'run_command'],
      filesChanged: ['src/retry.ts'],
      success: true,
    };

    const candidate = miner.mineFromSession(session)!;
    const persisted = miner.persistMinedSkill(candidate);

    expect(fs.existsSync(persisted.filePath)).toBe(true);
    expect(persisted.metadata.name).toBe(candidate.name);

    registry.refresh();
    const loaded = registry.getSkill(candidate.name);
    expect(loaded).toBeDefined();
    expect(loaded?.content.toLowerCase()).toContain('exponential backoff');
  });
});
