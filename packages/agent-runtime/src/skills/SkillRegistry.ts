import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Skill, SkillMetadata } from './SkillModel';
import { YamlFrontmatter } from './YamlFrontmatter';

export interface SkillRegistryOptions {
  workspaceRoot?: string;
  userHome?: string;
  includeBuiltins?: boolean;
}

export class SkillRegistry {
  private workspaceRoot: string;
  private userHome: string;
  private includeBuiltins: boolean;
  private cachedSkills: Map<string, Skill> = new Map();

  constructor(options: SkillRegistryOptions = {}) {
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.userHome = options.userHome || os.homedir();
    this.includeBuiltins = options.includeBuiltins !== false;
    this.refresh();
  }

  public refresh(): void {
    this.cachedSkills.clear();

    // 1. Built-in skills (lowest precedence)
    if (this.includeBuiltins) {
      for (const b of this.getBuiltinSkills()) {
        this.cachedSkills.set(b.metadata.name.toLowerCase(), b);
      }
    }

    // 2. User global skills (middle precedence)
    const userDirs = [
      path.join(this.userHome, '.agentos', 'skills'),
      path.join(this.userHome, '.claude', 'skills'),
      path.join(this.userHome, '.agents', 'skills'),
    ];
    for (const dir of userDirs) {
      this.scanDirectory(dir, 'user');
    }

    // 3. Workspace skills (highest precedence - overrides user and builtin)
    const wsDirs = [
      path.join(this.workspaceRoot, '.agentos', 'skills'),
      path.join(this.workspaceRoot, '.claude', 'skills'),
      path.join(this.workspaceRoot, '.agents', 'skills'),
    ];
    for (const dir of wsDirs) {
      this.scanDirectory(dir, 'workspace');
    }
  }

  private scanDirectory(baseDir: string, source: 'workspace' | 'user'): void {
    if (!fs.existsSync(baseDir)) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = path.join(baseDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          this.loadSkillFile(skillPath, source);
        }
      }
    } catch (_err) {
      // Non-fatal directory scanning error
    }
  }

  public loadSkillFile(filePath: string, source: 'workspace' | 'user' | 'builtin'): Skill | undefined {
    try {
      const rawText = fs.readFileSync(filePath, 'utf8');
      const parsed = YamlFrontmatter.parse<Partial<SkillMetadata>>(rawText);

      const folderName = path.basename(path.dirname(filePath));
      const metadata: SkillMetadata = {
        name: parsed.data.name || folderName,
        description: parsed.data.description || `Specialized skill for ${folderName}`,
        version: parsed.data.version || '1.0.0',
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
        tools: Array.isArray(parsed.data.tools) ? parsed.data.tools : [],
        author: parsed.data.author,
        parameters: parsed.data.parameters,
      };

      const skill: Skill = {
        metadata,
        content: parsed.content,
        rawFile: rawText,
        filePath,
        source,
      };

      this.cachedSkills.set(metadata.name.toLowerCase(), skill);
      return skill;
    } catch (_err) {
      return undefined;
    }
  }

  public getSkill(name: string): Skill | undefined {
    return this.cachedSkills.get(name.toLowerCase().trim());
  }

  public listSkills(): Skill[] {
    return Array.from(this.cachedSkills.values());
  }

  public hasSkill(name: string): boolean {
    return this.cachedSkills.has(name.toLowerCase().trim());
  }

  public scaffoldSkill(options: {
    name: string;
    description?: string;
    isGlobal?: boolean;
    tags?: string[];
    tools?: string[];
  }): { path: string; skill: Skill } {
    const slug = options.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) {
      throw new Error(`Invalid skill name: "${options.name}". Name must contain alphanumeric characters.`);
    }

    const baseDir = options.isGlobal
      ? path.join(this.userHome, '.agentos', 'skills', slug)
      : path.join(this.workspaceRoot, '.agentos', 'skills', slug);

    fs.mkdirSync(baseDir, { recursive: true });
    const filePath = path.join(baseDir, 'SKILL.md');

    const metadata: SkillMetadata = {
      name: slug,
      description: options.description || `Custom skill for ${slug}`,
      version: '1.0.0',
      tags: options.tags || ['custom'],
      tools: options.tools || ['read_file', 'edit_file', 'run_command'],
    };

    const starterBody = `# ${slug}\n\n## Objective\nProvide specialized procedures and instructions for ${slug}.\n\n## Workflow Steps\n1. Analyze current context and target files.\n2. Apply changes incrementally.\n3. Verify results before finalizing.\n\n## Pitfalls & Guardrails\n- Always check tests and typecheck before completing the task.\n`;

    const rawFile = YamlFrontmatter.stringify(metadata, starterBody);
    fs.writeFileSync(filePath, rawFile, 'utf8');

    const skill: Skill = {
      metadata,
      content: starterBody,
      rawFile,
      filePath,
      source: options.isGlobal ? 'user' : 'workspace',
    };

    this.cachedSkills.set(slug, skill);
    return { path: filePath, skill };
  }

  public formatSkillsForPrompt(): string {
    const skills = this.listSkills();
    if (skills.length === 0) return '';

    const lines: string[] = [
      '## Available Specialized Skills',
      'The following domain skills are installed in the workspace and user profile. You can invoke the `load_skill` tool with the skill name to fetch complete guidance, recipes, and guardrails for that skill:',
    ];

    for (const skill of skills) {
      const toolNotice = skill.metadata.tools?.length ? ` [tools: ${skill.metadata.tools.join(', ')}]` : '';
      lines.push(`- **${skill.metadata.name}**: ${skill.metadata.description}${toolNotice}`);
    }

    return lines.join('\n');
  }

  private getBuiltinSkills(): Skill[] {
    return [
      {
        metadata: {
          name: 'systematic-debugging',
          description: 'Step-by-step root cause analysis, hypothesis testing, and minimal reproducible failure methodology',
          version: '1.0.0',
          tags: ['debugging', 'verification'],
          tools: ['read_file', 'edit_file', 'run_command', 'grep'],
        },
        content: `# Systematic Debugging Skill\n\n## Objective\nFind and resolve bugs methodically without guessing or diff thrashing.\n\n## Execution Workflow\n1. **Reproduce**: Run the test or verifier to capture exact stack traces and error messages.\n2. **Isolate**: Inspect relevant source code and stack trace frames using \`read_file\` and \`grep\`.\n3. **Hypothesize**: Formulate a single, falsifiable hypothesis explaining why the error occurs.\n4. **Targeted Fix**: Make minimal edits using \`edit_file\`.\n5. **Verify**: Re-run the verification command to confirm the fix.\n`,
        rawFile: '',
        filePath: 'builtin:systematic-debugging',
        source: 'builtin',
      },
      {
        metadata: {
          name: 'test-driven-refactoring',
          description: 'Refactoring codebase architecture safely under green test coverage with continuous verifier passes',
          version: '1.0.0',
          tags: ['refactoring', 'tests'],
          tools: ['read_file', 'edit_file', 'run_command'],
        },
        content: `# Test-Driven Refactoring Skill\n\n## Objective\nImprove modularity, readability, and performance while maintaining 100% test pass rate.\n\n## Execution Workflow\n1. **Verify Baseline**: Run test suite before making any edits.\n2. **Atomic Steps**: Refactor one function, class, or module at a time.\n3. **Verify Green**: Run tests after each atomic change.\n4. **Rollback on Failure**: If a test breaks, revert immediately instead of stacking speculative changes.\n`,
        rawFile: '',
        filePath: 'builtin:test-driven-refactoring',
        source: 'builtin',
      },
    ];
  }
}
