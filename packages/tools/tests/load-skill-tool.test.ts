import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { loadSkillTool } from '../src/implementations/load_skill';
import type { ToolContext } from '../src/types';

describe('load_skill Tool (Action: Runtime Skill Invocation)', () => {
  let tempWs: string;
  let context: ToolContext;

  beforeEach(() => {
    tempWs = fs.mkdtempSync(path.join(os.tmpdir(), 'load-skill-ws-'));
    context = { workspaceRoot: tempWs };
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWs, { recursive: true, force: true });
    } catch (_e) {
      // Cleanup temp workspace
    }
  });

  it('1. loads built-in skill successfully', async () => {
    const res = await loadSkillTool.execute({ name: 'systematic-debugging' }, context);
    expect(res.isError).toBe(false);
    expect(res.content).toContain('[Skill: systematic-debugging (Built-in)]');
    expect(res.content).toContain('Reproduce');
    expect(res.content).toContain('Isolate');
  });

  it('2. loads workspace custom skill from .agentos/skills/<name>/SKILL.md', async () => {
    const skillDir = path.join(tempWs, '.agentos', 'skills', 'custom-auth-flow');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: custom-auth-flow\ndescription: Auth tokens flow\n---\n\n# Custom Auth Flow\n1. Validate JWT\n2. Refresh expiry\n`
    );

    const res = await loadSkillTool.execute({ name: 'custom-auth-flow' }, context);
    expect(res.isError).toBe(false);
    expect(res.content).toContain('loaded from');
    expect(res.content).toContain('Validate JWT');
    expect(res.content).toContain('Refresh expiry');
  });

  it('3. returns helpful error with list of available skills when skill not found', async () => {
    const res = await loadSkillTool.execute({ name: 'non-existent-skill' }, context);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('Skill "non-existent-skill" not found');
    expect(res.content).toContain('Available skills:');
    expect(res.content).toContain('systematic-debugging');
  });

  it('4. rejects invalid inputs', async () => {
    const res = await loadSkillTool.execute({ name: '' }, context);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('Parameter "name" must be a non-empty string');
  });
});
