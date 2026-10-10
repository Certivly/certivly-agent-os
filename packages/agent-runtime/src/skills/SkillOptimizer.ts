import * as fs from 'fs';
import { Skill, SkillPatch, SkillOptimizationResult } from './SkillModel';
import { YamlFrontmatter } from './YamlFrontmatter';

export interface EvalGateResult {
  passed: boolean;
  score?: number;
  error?: string;
  feedback?: string;
}

export type SkillEvalFunction = (skill: Skill) => Promise<EvalGateResult>;

export class SkillOptimizer {
  public applyPatch(content: string, patch: SkillPatch): string {
    switch (patch.op) {
      case 'insert_after': {
        if (!patch.anchor || !patch.content) return content;
        const idx = content.indexOf(patch.anchor);
        if (idx === -1) return content;
        const insertPos = idx + patch.anchor.length;
        return (
          content.slice(0, insertPos) +
          '\n\n' +
          patch.content.trim() +
          '\n' +
          content.slice(insertPos).replace(/^\n*/, '\n')
        );
      }

      case 'append_section': {
        if (!patch.content) return content;
        return content.trim() + '\n\n' + patch.content.trim() + '\n';
      }

      case 'replace_block': {
        if (!patch.targetText || patch.content === undefined) return content;
        if (!content.includes(patch.targetText)) return content;
        return content.replace(patch.targetText, patch.content);
      }

      case 'delete_block': {
        if (!patch.targetText) return content;
        if (!content.includes(patch.targetText)) return content;
        return content.replace(patch.targetText, '').replace(/\n{3,}/g, '\n\n');
      }

      default:
        return content;
    }
  }

  public async optimizeSkill(
    skill: Skill,
    proposedPatches: SkillPatch[],
    evalFn: SkillEvalFunction
  ): Promise<SkillOptimizationResult> {
    const originalContent = skill.content;
    let currentContent = originalContent;

    // 1. Run baseline evaluation
    const baseline = await evalFn(skill);
    let bestScore = baseline.score ?? (baseline.passed ? 1 : 0);

    const acceptedPatches: SkillPatch[] = [];
    const rejectedPatches: SkillPatch[] = [];

    // 2. Iterate through proposed bounded patches
    for (let i = 0; i < proposedPatches.length; i++) {
      const patch = proposedPatches[i];
      const mutatedContent = this.applyPatch(currentContent, patch);

      if (mutatedContent === currentContent) {
        // Patch had no effect (e.g. anchor not found)
        rejectedPatches.push(patch);
        continue;
      }

      // Create mutated candidate skill
      const candidateSkill: Skill = {
        ...skill,
        content: mutatedContent,
        rawFile: YamlFrontmatter.stringify(skill.metadata, mutatedContent),
      };

      // 3. Validation Gate
      const evalRes = await evalFn(candidateSkill);
      const candScore = evalRes.score ?? (evalRes.passed ? 1 : 0);

      if (evalRes.passed && candScore >= bestScore) {
        // Accept mutation
        currentContent = mutatedContent;
        bestScore = candScore;
        acceptedPatches.push(patch);
      } else {
        // Reject and rollback mutation
        rejectedPatches.push(patch);
      }
    }

    const finalSkill: Skill = {
      ...skill,
      content: currentContent,
      rawFile: YamlFrontmatter.stringify(skill.metadata, currentContent),
    };

    // If file exists on disk and any patches were accepted, persist changes
    if (acceptedPatches.length > 0 && fs.existsSync(skill.filePath)) {
      try {
        fs.writeFileSync(skill.filePath, finalSkill.rawFile, 'utf8');
      } catch (_err) {
        // Non-fatal disk write error
      }
    }

    const finalEval = await evalFn(finalSkill);

    return {
      skillName: skill.metadata.name,
      baselinePassed: baseline.passed,
      optimizedPassed: finalEval.passed,
      iterations: proposedPatches.length,
      acceptedPatches,
      rejectedPatches,
      originalContent,
      finalContent: currentContent,
      summary: `Applied ${acceptedPatches.length}/${proposedPatches.length} patches. Baseline: ${
        baseline.passed ? 'PASS' : 'FAIL'
      } -> Final: ${finalEval.passed ? 'PASS' : 'FAIL'}.`,
    };
  }

  public generateRefinementPatches(feedback: string, targetSections?: string[]): SkillPatch[] {
    const patches: SkillPatch[] = [];

    if (feedback.includes('timeout') || feedback.includes('timed out')) {
      patches.push({
        op: 'append_section',
        content: '### Timeout Avoidance Guardrail\n- Avoid deep recursion or running long-running processes without strict bounds.\n- Query targeted file slices rather than dumping entire trees.',
        rationale: 'Mitigate observed execution timeouts',
      });
    }

    if (feedback.includes('syntax') || feedback.includes('SyntaxError')) {
      patches.push({
        op: 'append_section',
        content: '### Syntax Verification Guardrail\n- Verify matching braces, parentheses, and semicolons before completing edits.\n- Run typecheck or build commands to validate AST validity.',
        rationale: 'Prevent syntax and parse errors',
      });
    }

    if (feedback.includes('diff') || feedback.includes('thrash') || feedback.includes('oldText not found')) {
      patches.push({
        op: 'append_section',
        content: '### Context Matching Guardrail\n- Check line endings and whitespace in target files with read_file before issuing edit_file.\n- Provide at least 3 lines of unique surrounding context for oldText.',
        rationale: 'Prevent edit context mismatch and diff thrashing',
      });
    }

    // Default patch if none matched
    if (patches.length === 0) {
      patches.push({
        op: 'append_section',
        content: `### Optimization Insight\n- Additional guideline: ${feedback.slice(0, 120)}`,
        rationale: 'General feedback integration',
      });
    }

    return patches;
  }
}
