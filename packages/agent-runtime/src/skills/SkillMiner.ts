import * as path from 'path';
import { MinedSkillCandidate, Skill } from './SkillModel';
import { SkillRegistry } from './SkillRegistry';
import { YamlFrontmatter } from './YamlFrontmatter';

export interface SessionHistoryItem {
  sessionId: string;
  userPrompt: string;
  turns: number;
  toolNames: string[];
  filesChanged: string[];
  success: boolean;
  finalResponse?: string;
  errorsEncountered?: string[];
}

export class SkillMiner {
  constructor(private registry?: SkillRegistry) {}

  public mineFromSession(session: SessionHistoryItem): MinedSkillCandidate | null {
    // Only mine successful sessions with non-trivial actions
    if (!session.success || session.turns < 1 || session.toolNames.length === 0) {
      return null;
    }

    const uniqueTools = Array.from(new Set(session.toolNames));
    const slug = this.generateSkillSlug(session.userPrompt);
    const tags = this.extractTags(session.userPrompt, uniqueTools);

    const description = `Procedural workflow mined from verified session for: "${session.userPrompt.slice(0, 80).trim()}"`;

    const instructions = this.generateSkillInstructions(session, uniqueTools);

    return {
      name: slug,
      description,
      tags,
      tools: uniqueTools,
      instructions,
      sourceSessionId: session.sessionId,
      turnsCount: session.turns,
    };
  }

  public mineMultiple(sessions: SessionHistoryItem[], limit: number = 5): MinedSkillCandidate[] {
    const candidates: MinedSkillCandidate[] = [];
    const seenSlugs = new Set<string>();

    for (const session of sessions) {
      const candidate = this.mineFromSession(session);
      if (candidate && !seenSlugs.has(candidate.name)) {
        seenSlugs.add(candidate.name);
        candidates.push(candidate);
        if (candidates.length >= limit) break;
      }
    }

    return candidates;
  }

  public persistMinedSkill(candidate: MinedSkillCandidate, outputDir?: string): Skill {
    const registry = this.registry || new SkillRegistry();
    const result = registry.scaffoldSkill({
      name: candidate.name,
      description: candidate.description,
      tags: candidate.tags,
      tools: candidate.tools,
    });

    const fullMarkdown = YamlFrontmatter.stringify(
      {
        name: candidate.name,
        description: candidate.description,
        version: '1.0.0',
        tags: candidate.tags,
        tools: candidate.tools,
        sourceSession: candidate.sourceSessionId,
      },
      candidate.instructions
    );

    const fs = require('fs');
    fs.writeFileSync(result.path, fullMarkdown, 'utf8');

    return {
      metadata: {
        name: candidate.name,
        description: candidate.description,
        version: '1.0.0',
        tags: candidate.tags,
        tools: candidate.tools,
      },
      content: candidate.instructions,
      rawFile: fullMarkdown,
      filePath: result.path,
      source: 'workspace',
    };
  }

  private generateSkillSlug(prompt: string): string {
    const cleaned = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter((w) => !['the', 'a', 'an', 'to', 'in', 'for', 'and', 'or', 'of', 'with', 'on', 'at', 'please', 'can', 'you'].includes(w))
      .slice(0, 4)
      .join('-');

    return cleaned || 'custom-task-skill';
  }

  private extractTags(prompt: string, tools: string[]): string[] {
    const tags = new Set<string>(['mined', 'workflow']);
    const lower = prompt.toLowerCase();

    if (lower.includes('test') || lower.includes('spec')) tags.add('testing');
    if (lower.includes('refactor')) tags.add('refactoring');
    if (lower.includes('fix') || lower.includes('bug')) tags.add('bugfix');
    if (lower.includes('api') || lower.includes('http')) tags.add('api');
    if (lower.includes('db') || lower.includes('database')) tags.add('database');
    if (lower.includes('ui') || lower.includes('component')) tags.add('frontend');

    for (const tool of tools) {
      if (tool.includes('git') || tool.includes('patch')) tags.add('git');
    }

    return Array.from(tags);
  }

  private generateSkillInstructions(session: SessionHistoryItem, tools: string[]): string {
    const lines: string[] = [
      `# Skill: ${session.userPrompt.slice(0, 60)}`,
      '',
      '## Objective',
      `Execute and verify tasks matching: "${session.userPrompt}"`,
      '',
      '## Proven Tool Recipe',
    ];

    tools.forEach((t, i) => {
      lines.push(`${i + 1}. **${t}**: Leverage for exploration, targeted edits, or execution verification.`);
    });

    if (session.filesChanged.length > 0) {
      lines.push('');
      lines.push('## Target File Patterns');
      session.filesChanged.forEach((f) => {
        lines.push(`- \`${f}\``);
      });
    }

    lines.push('');
    lines.push('## Execution Guidelines');
    lines.push('1. Inspect context before modifying code.');
    lines.push('2. Make minimal, surgical edits preserving whitespace and conventions.');
    lines.push('3. Run verification before reporting task completion.');

    if (session.errorsEncountered && session.errorsEncountered.length > 0) {
      lines.push('');
      lines.push('## Recovery Strategies (Learned from Iterations)');
      session.errorsEncountered.forEach((err) => {
        lines.push(`- Encountered: "${err.slice(0, 80)}" -> Recovered by analyzing surrounding context and re-verifying.`);
      });
    }

    return lines.join('\n');
  }
}
