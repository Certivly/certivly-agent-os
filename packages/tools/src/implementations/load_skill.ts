import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Tool } from '../interface';
import { WorkspaceManager, workspaceManager } from '../workspace';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

const BUILTIN_SKILLS: Record<string, string> = {
  'systematic-debugging': `# Systematic Debugging Skill

## Objective
Find and resolve bugs methodically without guessing or diff thrashing.

## Execution Workflow
1. **Reproduce**: Run the test or verifier to capture exact stack traces and error messages.
2. **Isolate**: Inspect relevant source code and stack trace frames using \`read_file\` and \`grep\`.
3. **Hypothesize**: Formulate a single, falsifiable hypothesis explaining why the error occurs.
4. **Targeted Fix**: Make minimal edits using \`edit_file\`.
5. **Verify**: Re-run the verification command to confirm the fix.
`,
  'test-driven-refactoring': `# Test-Driven Refactoring Skill

## Objective
Improve modularity, readability, and performance while maintaining 100% test pass rate.

## Execution Workflow
1. **Verify Baseline**: Run test suite before making any edits.
2. **Atomic Steps**: Refactor one function, class, or module at a time.
3. **Verify Green**: Run tests after each atomic change.
4. **Rollback on Failure**: If a test breaks, revert immediately instead of stacking speculative changes.
`,
};

function findSkillFile(name: string, workspaceRoot: string): string | null {
  const slug = name.toLowerCase().trim();
  const searchDirs = [
    path.join(workspaceRoot, '.agentos', 'skills', slug, 'SKILL.md'),
    path.join(workspaceRoot, '.claude', 'skills', slug, 'SKILL.md'),
    path.join(workspaceRoot, '.agents', 'skills', slug, 'SKILL.md'),
    path.join(os.homedir(), '.agentos', 'skills', slug, 'SKILL.md'),
    path.join(os.homedir(), '.claude', 'skills', slug, 'SKILL.md'),
    path.join(os.homedir(), '.agents', 'skills', slug, 'SKILL.md'),
  ];

  for (const candidate of searchDirs) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function discoverAvailableSkillNames(workspaceRoot: string): string[] {
  const found = new Set<string>(Object.keys(BUILTIN_SKILLS));
  const baseDirs = [
    path.join(workspaceRoot, '.agentos', 'skills'),
    path.join(workspaceRoot, '.claude', 'skills'),
    path.join(workspaceRoot, '.agents', 'skills'),
    path.join(os.homedir(), '.agentos', 'skills'),
    path.join(os.homedir(), '.claude', 'skills'),
  ];

  for (const dir of baseDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'SKILL.md'))) {
          found.add(entry.name);
        }
      }
    } catch (_err) {
      // Non-fatal scanning error
    }
  }

  return Array.from(found).sort();
}

export const loadSkillTool: WorkspaceTool & Tool = {
  name: 'load_skill',
  description: 'Load full procedural instructions, recipes, and guardrails for an available skill into context',
  spec: {
    name: 'load_skill',
    description: 'Load full procedural instructions, recipes, and guardrails for an available skill into context',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the skill to load (e.g. "systematic-debugging", "test-driven-refactoring")',
        },
      },
      required: ['name'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const rawName = args.name;
    if (typeof rawName !== 'string' || !rawName.trim()) {
      const msg = 'Error: Parameter "name" must be a non-empty string.';
      return { content: msg, output: msg, isError: true };
    }

    const skillName = rawName.trim().toLowerCase();
    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;
    const workspaceRoot = ws.root;

    // Check disk
    const skillFilePath = findSkillFile(skillName, workspaceRoot);
    if (skillFilePath) {
      try {
        const content = fs.readFileSync(skillFilePath, 'utf8');
        const header = `[Skill: ${skillName} loaded from ${skillFilePath}]\n\n`;
        const output = header + content;
        return { content: output, output, isError: false };
      } catch (err: any) {
        const msg = `Error reading skill file "${skillFilePath}": ${err?.message || String(err)}`;
        return { content: msg, output: msg, isError: true };
      }
    }

    // Check built-in fallback
    if (BUILTIN_SKILLS[skillName]) {
      const content = BUILTIN_SKILLS[skillName];
      const output = `[Skill: ${skillName} (Built-in)]\n\n` + content;
      return { content: output, output, isError: false };
    }

    const available = discoverAvailableSkillNames(workspaceRoot);
    const availableMsg = available.length > 0 ? ` Available skills: ${available.join(', ')}` : ' No skills found.';
    const errorMsg = `Error: Skill "${rawName}" not found.${availableMsg}`;
    return { content: errorMsg, output: errorMsg, isError: true };
  },
};
