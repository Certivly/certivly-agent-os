import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CommandDispatcher } from '../src/ui/commands/CommandDispatcher';
import { SkillRegistry } from '@agent-os/agent-runtime';

describe('Skills CLI Subcommands & Interactive Commands', () => {
  let tempWs: string;

  beforeEach(() => {
    tempWs = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-cli-ws-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWs, { recursive: true, force: true });
    } catch (_e) {
      // Cleanup temp workspace
    }
  });

  it('1. CommandDispatcher dispatches /skills and /skill commands', () => {
    const listRes = CommandDispatcher.dispatch('/skills');
    expect(listRes.isCommand).toBe(true);
    expect(listRes.action).toBe('skills');

    const skillRes = CommandDispatcher.dispatch('/skill systematic-debugging');
    expect(skillRes.isCommand).toBe(true);
    expect(skillRes.action).toBe('skill');
    expect(skillRes.payload?.skillName).toBe('systematic-debugging');

    const emptySkill = CommandDispatcher.dispatch('/skill');
    expect(emptySkill.isCommand).toBe(true);
    expect(emptySkill.action).toBe('skills');
  });

  it('2. SkillRegistry supports user-created skills like in Claude Code or Qwen Code', () => {
    const registry = new SkillRegistry({ workspaceRoot: tempWs });
    const scaffolded = registry.scaffoldSkill({
      name: 'fastapi-endpoint-scaffold',
      description: 'Creating production FastAPI routes with pydantic validation',
      tags: ['python', 'fastapi'],
      tools: ['read_file', 'edit_file', 'run_command'],
    });

    expect(fs.existsSync(scaffolded.path)).toBe(true);

    registry.refresh();
    const retrieved = registry.getSkill('fastapi-endpoint-scaffold');
    expect(retrieved).toBeDefined();
    expect(retrieved?.metadata.description).toContain('FastAPI');
  });

  it('3. CommandDispatcher /help includes /skills and /skill commands', () => {
    const helpRes = CommandDispatcher.dispatch('/help');
    expect(helpRes.isCommand).toBe(true);
    expect(helpRes.action).toBe('help');
    expect(helpRes.message).toContain('/skills');
    expect(helpRes.message).toContain('/skill <name>');
  });

  it('4. Discovers skills in .claude/skills and .agents/skills interoperability paths', () => {
    // Create a mock .claude/skills/custom-claude-skill/SKILL.md in workspace
    const claudeSkillDir = path.join(tempWs, '.claude', 'skills', 'custom-claude-skill');
    fs.mkdirSync(claudeSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeSkillDir, 'SKILL.md'),
      '---\nname: custom-claude-skill\ndescription: Custom Claude skill interoperability\n---\n\n# Custom Claude Skill\n\nInstructions here.'
    );

    const registry = new SkillRegistry({ workspaceRoot: tempWs });
    const skill = registry.getSkill('custom-claude-skill');
    expect(skill).toBeDefined();
    expect(skill?.source).toBe('workspace');
    expect(skill?.metadata.description).toBe('Custom Claude skill interoperability');
  });
});
