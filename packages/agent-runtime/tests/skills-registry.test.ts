import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SkillRegistry } from '../src/skills/SkillRegistry';
import { YamlFrontmatter } from '../src/skills/YamlFrontmatter';

describe('SkillRegistry & SKILL.md Standard (Action: Skills System)', () => {
  let tempWs: string;
  let tempHome: string;

  beforeEach(() => {
    tempWs = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-ws-'));
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-home-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWs, { recursive: true, force: true });
    } catch (_e) {
      // Cleanup temp workspace
    }
    try {
      fs.rmSync(tempHome, { recursive: true, force: true });
    } catch (_e) {
      // Cleanup temp user home
    }
  });

  it('1. discovers built-in skills by default', () => {
    const registry = new SkillRegistry({ workspaceRoot: tempWs, userHome: tempHome });
    const skills = registry.listSkills();

    expect(skills.length).toBeGreaterThanOrEqual(2);
    expect(registry.hasSkill('systematic-debugging')).toBe(true);
    expect(registry.hasSkill('test-driven-refactoring')).toBe(true);

    const debugSkill = registry.getSkill('systematic-debugging');
    expect(debugSkill).toBeDefined();
    expect(debugSkill?.metadata.tools).toContain('read_file');
    expect(debugSkill?.source).toBe('builtin');
  });

  it('2. scaffolds and loads a new user workspace skill (Qwen/Claude style)', () => {
    const registry = new SkillRegistry({ workspaceRoot: tempWs, userHome: tempHome });
    const result = registry.scaffoldSkill({
      name: 'react-component-refactor',
      description: 'Refactoring React components safely',
      tags: ['react', 'frontend'],
      tools: ['read_file', 'edit_file'],
    });

    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.skill.metadata.name).toBe('react-component-refactor');

    registry.refresh();
    const loaded = registry.getSkill('react-component-refactor');
    expect(loaded).toBeDefined();
    expect(loaded?.source).toBe('workspace');
    expect(loaded?.metadata.description).toBe('Refactoring React components safely');
    expect(loaded?.metadata.tags).toContain('react');
    expect(loaded?.content).toContain('Workflow Steps');
  });

  it('3. workspace skills override user global and built-in skills with identical names', () => {
    // Scaffold global skill in userHome
    const globalSkillDir = path.join(tempHome, '.agentos', 'skills', 'systematic-debugging');
    fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalSkillDir, 'SKILL.md'),
      YamlFrontmatter.stringify(
        { name: 'systematic-debugging', description: 'User global override' },
        'Global custom debugging body'
      )
    );

    // Scaffold workspace skill in tempWs
    const wsSkillDir = path.join(tempWs, '.agentos', 'skills', 'systematic-debugging');
    fs.mkdirSync(wsSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(wsSkillDir, 'SKILL.md'),
      YamlFrontmatter.stringify(
        { name: 'systematic-debugging', description: 'Workspace project override' },
        'Workspace custom debugging body'
      )
    );

    const registry = new SkillRegistry({ workspaceRoot: tempWs, userHome: tempHome });
    const active = registry.getSkill('systematic-debugging');

    expect(active?.source).toBe('workspace');
    expect(active?.metadata.description).toBe('Workspace project override');
    expect(active?.content).toContain('Workspace custom debugging body');
  });

  it('4. formats available skills for system prompt injection', () => {
    const registry = new SkillRegistry({ workspaceRoot: tempWs, userHome: tempHome });
    registry.scaffoldSkill({
      name: 'api-migration',
      description: 'Guidelines for migrating legacy REST endpoints to v2',
      tools: ['read_file', 'edit_file'],
    });

    const promptText = registry.formatSkillsForPrompt();
    expect(promptText).toContain('## Available Specialized Skills');
    expect(promptText).toContain('api-migration');
    expect(promptText).toContain('Guidelines for migrating legacy REST endpoints to v2');
    expect(promptText).toContain('[tools: read_file, edit_file]');
  });

  it('5. validates skill slugs on creation', () => {
    const registry = new SkillRegistry({ workspaceRoot: tempWs, userHome: tempHome });
    expect(() => registry.scaffoldSkill({ name: '   ' })).toThrow(/Invalid skill name/);
  });
});
