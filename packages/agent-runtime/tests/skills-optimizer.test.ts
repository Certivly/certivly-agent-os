import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SkillOptimizer } from '../src/skills/SkillOptimizer';
import { SkillRegistry } from '../src/skills/SkillRegistry';
import { SkillPatch } from '../src/skills/SkillModel';

describe('SkillOptimizer (Closed-loop Bounded Prompt Optimization - SkillOpt)', () => {
  let tempWs: string;
  let registry: SkillRegistry;
  let optimizer: SkillOptimizer;

  beforeEach(() => {
    tempWs = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-ws-'));
    registry = new SkillRegistry({ workspaceRoot: tempWs });
    optimizer = new SkillOptimizer();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWs, { recursive: true, force: true });
    } catch (_e) {
      // Cleanup temp workspace
    }
  });

  it('1. correctly applies bounded text patch operations without rewriting whole document', () => {
    const baseContent = `# Target Skill\n\n## Step 1\nRun inspection.\n\n## Step 2\nApply modifications.\n`;

    // 1. insert_after
    const withInsert = optimizer.applyPatch(baseContent, {
      op: 'insert_after',
      anchor: 'Run inspection.',
      content: 'Confirm tests pass baseline.',
    });
    expect(withInsert).toContain('Run inspection.\n\nConfirm tests pass baseline.\n\n## Step 2');

    // 2. append_section
    const withAppend = optimizer.applyPatch(withInsert, {
      op: 'append_section',
      content: '## Guardrails\n- Never skip verification.',
    });
    expect(withAppend).toContain('## Guardrails\n- Never skip verification.');

    // 3. replace_block
    const withReplace = optimizer.applyPatch(withAppend, {
      op: 'replace_block',
      targetText: 'Apply modifications.',
      content: 'Apply atomic modifications using edit_file.',
    });
    expect(withReplace).toContain('Apply atomic modifications using edit_file.');
    expect(withReplace).not.toContain('Apply modifications.\n');

    // 4. delete_block
    const withDelete = optimizer.applyPatch(withReplace, {
      op: 'delete_block',
      targetText: 'Confirm tests pass baseline.',
    });
    expect(withDelete).not.toContain('Confirm tests pass baseline.');
  });

  it('2. optimizes skill: accepts patches that pass eval gate, rolls back regressing patches', async () => {
    const scaffolded = registry.scaffoldSkill({
      name: 'lru-cache-optimization',
      description: 'Optimizing LRU cache data structures',
    });

    const skill = scaffolded.skill;

    const patches: SkillPatch[] = [
      {
        op: 'append_section',
        content: '## Verified Performance Recipe\n- Use doubly linked list with Map index for O(1) ops.',
        rationale: 'Positive architectural guidance',
      },
      {
        op: 'append_section',
        content: 'INVALID POISON: Throw SyntaxError whenever called',
        rationale: 'Harmful mutation to test rollback',
      },
      {
        op: 'append_section',
        content: '## Edge Cases\n- Ensure capacity <= 0 throws RangeError.',
        rationale: 'Good edge case handling',
      },
    ];

    const result = await optimizer.optimizeSkill(skill, patches, async (candidateSkill) => {
      if (candidateSkill.content.includes('SyntaxError')) {
        return { passed: false, score: 0, feedback: 'Poisoned syntax error caused eval failure' };
      }
      return { passed: true, score: candidateSkill.content.includes('doubly linked list') ? 2 : 1 };
    });

    expect(result.acceptedPatches).toHaveLength(2);
    expect(result.rejectedPatches).toHaveLength(1);
    expect(result.finalContent).toContain('doubly linked list');
    expect(result.finalContent).toContain('Ensure capacity <= 0 throws RangeError');
    expect(result.finalContent).not.toContain('INVALID POISON');
    expect(result.optimizedPassed).toBe(true);

    // Verify persisted on disk
    const onDisk = fs.readFileSync(scaffolded.path, 'utf8');
    expect(onDisk).toContain('doubly linked list');
  });

  it('3. generates targeted refinement patches from failure feedback', () => {
    const patches = optimizer.generateRefinementPatches('Execution timed out while running unit tests');
    expect(patches.length).toBeGreaterThan(0);
    expect(patches[0].op).toBe('append_section');
    expect(patches[0].content).toContain('Timeout Avoidance');
  });
});
