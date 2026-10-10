import * as fs from 'fs';
import * as path from 'path';

export interface ProjectMetadata {
  name: string;
  ecosystem: 'node' | 'python' | 'rust' | 'go' | 'general';
  packageManager?: 'bun' | 'pnpm' | 'yarn' | 'npm' | 'pip' | 'cargo' | 'go';
  testCommand?: string;
  buildCommand?: string;
  lintCommand?: string;
  devCommand?: string;
  hasGit: boolean;
}

export interface InitOptions {
  cwd?: string;
  force?: boolean;
  model?: string;
  provider?: string;
}

export interface InitResult {
  projectRoot: string;
  metadata: ProjectMetadata;
  createdFiles: string[];
  skippedFiles: string[];
  configPath: string;
  agentsMdPath: string;
}

export function detectProject(cwd: string): ProjectMetadata {
  const hasGit = fs.existsSync(path.join(cwd, '.git'));
  let name = path.basename(cwd);

  // 1. Node / Bun / TypeScript
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      name = pkg.name || name;
      let pm: 'bun' | 'pnpm' | 'yarn' | 'npm' = 'npm';
      if (fs.existsSync(path.join(cwd, 'bun.lock')) || fs.existsSync(path.join(cwd, 'bun.lockb'))) pm = 'bun';
      else if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) pm = 'pnpm';
      else if (fs.existsSync(path.join(cwd, 'yarn.lock'))) pm = 'yarn';

      const scripts = pkg.scripts || {};
      const testCmd = scripts.test ? `${pm} test` : undefined;
      const buildCmd = scripts.build ? `${pm} run build` : undefined;
      const lintCmd = scripts.lint ? `${pm} run lint` : undefined;
      const devCmd = scripts.dev ? `${pm} run dev` : scripts.start ? `${pm} start` : undefined;

      return {
        name,
        ecosystem: 'node',
        packageManager: pm,
        testCommand: testCmd,
        buildCommand: buildCmd,
        lintCommand: lintCmd,
        devCommand: devCmd,
        hasGit,
      };
    } catch (_err) {
      // Fallback
    }
  }

  // 2. Python
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'setup.py'))) {
    return {
      name,
      ecosystem: 'python',
      packageManager: 'pip',
      testCommand: fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'tests')) ? 'pytest' : 'python -m unittest',
      buildCommand: undefined,
      lintCommand: 'ruff check .',
      devCommand: undefined,
      hasGit,
    };
  }

  // 3. Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    return {
      name,
      ecosystem: 'rust',
      packageManager: 'cargo',
      testCommand: 'cargo test',
      buildCommand: 'cargo build',
      lintCommand: 'cargo clippy',
      devCommand: 'cargo run',
      hasGit,
    };
  }

  // 4. Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    return {
      name,
      ecosystem: 'go',
      packageManager: 'go',
      testCommand: 'go test ./...',
      buildCommand: 'go build ./...',
      lintCommand: 'golangci-lint run',
      devCommand: undefined,
      hasGit,
    };
  }

  return {
    name,
    ecosystem: 'general',
    hasGit,
  };
}

export function generateAgentsMarkdown(meta: ProjectMetadata): string {
  const commandsSection = [
    meta.buildCommand ? `- **Build**: \`${meta.buildCommand}\`` : null,
    meta.testCommand ? `- **Test**: \`${meta.testCommand}\`` : null,
    meta.lintCommand ? `- **Lint**: \`${meta.lintCommand}\`` : null,
    meta.devCommand ? `- **Dev**: \`${meta.devCommand}\`` : null,
  ].filter(Boolean).join('\n') || '- None configured yet';

  return `# ${meta.name} - Agent Operating Guidelines

This repository is powered by **AgentOS**. This document defines project guidelines, operational commands, and coding standards for all AI agents.

## Project Overview
- **Name**: ${meta.name}
- **Ecosystem**: ${meta.ecosystem.toUpperCase()}
- **Package Manager**: ${meta.packageManager || 'default'}
- **Git Repository**: ${meta.hasGit ? 'Detected' : 'Not initialized'}

## Development & Verification Commands
${commandsSection}

> [!IMPORTANT]
> Always run \`${meta.testCommand || 'tests'}\` after applying code edits to verify that no regressions have been introduced.

## Architecture & Directory Conventions
- \`.agentos/\`: AgentOS workspace configuration, backups, and session database.
- \`.agents/\`: Repository-level agent customizations (skills, rules, subagents).
  - \`.agents/skills/\`: Reusable task workflows and cheatsheets.
  - \`.agents/rules/\`: Architectural rules and guidelines.
  - \`.agents/subagents/\`: Specialized subagent definitions.

## Agent Guidelines & Standards
1. **Verification-First**: Never declare a task complete without executing test suites or syntax verification.
2. **Minimal Diff**: Prefer surgical line replacements over full file rewrites.
3. **Preserve Documentation**: Maintain existing comments and docstrings.
4. **Anti-Hallucination**: When doing web research, always verify primary source documentation via \`read_url\`.
`;
}

export function runInit(options: InitOptions = {}): InitResult {
  const cwd = options.cwd || process.cwd();
  const meta = detectProject(cwd);

  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];

  // 1. .agentos directory & config.json
  const agentosDir = path.join(cwd, '.agentos');
  if (!fs.existsSync(agentosDir)) {
    fs.mkdirSync(agentosDir, { recursive: true });
  }

  const configPath = path.join(agentosDir, 'config.json');
  if (!fs.existsSync(configPath) || options.force) {
    const defaultConfig = {
      activeProvider: options.provider || 'anthropic',
      activeModel: options.model || 'claude-3-5-sonnet',
      permissionMode: 'manual',
      agent: {
        maxTurns: 40,
        planningMode: 'auto',
        antiLoopMonitoring: true,
        modelRoles: {
          primary: options.model || 'claude-3-5-sonnet',
          fast: 'claude-3-5-haiku',
          review: options.model || 'claude-3-5-sonnet',
        },
      },
      repository: {
        ignorePatterns: ['node_modules', '.git', 'dist', 'build', '.agentos/sessions'],
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    createdFiles.push('.agentos/config.json');
  } else {
    skippedFiles.push('.agentos/config.json (already exists)');
  }

  // 2. .agents folder structure
  const agentsDir = path.join(cwd, '.agents');
  const rulesDir = path.join(agentsDir, 'rules');
  const skillsDir = path.join(agentsDir, 'skills');
  const subagentsDir = path.join(agentsDir, 'subagents');

  [rulesDir, skillsDir, subagentsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 3. AGENTS.md
  const agentsMdPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsMdPath) || options.force) {
    fs.writeFileSync(agentsMdPath, generateAgentsMarkdown(meta), 'utf-8');
    createdFiles.push('AGENTS.md');
  } else {
    skippedFiles.push('AGENTS.md (already exists)');
  }

  // 4. Sample rule: coding-style.md
  const rulePath = path.join(rulesDir, 'coding-style.md');
  if (!fs.existsSync(rulePath) || options.force) {
    const ruleContent = `# Coding Style & Conventions

- Follow standard formatting and linting conventions for ${meta.ecosystem}.
- Write descriptive function names and explicit return types.
- Ensure all public APIs have unit tests.
`;
    fs.writeFileSync(rulePath, ruleContent, 'utf-8');
    createdFiles.push('.agents/rules/coding-style.md');
  } else {
    skippedFiles.push('.agents/rules/coding-style.md (already exists)');
  }

  // 5. Sample subagent: project-reviewer.json
  const subagentPath = path.join(subagentsDir, 'project-reviewer.json');
  if (!fs.existsSync(subagentPath) || options.force) {
    const subagentDef = {
      name: 'project-reviewer',
      role: 'reviewer',
      description: 'Reviews code changes against project conventions and test coverage',
      tools: ['read_file', 'grep', 'run_command'],
      modelRole: 'review',
      maxTurns: 10,
      systemPrompt: 'You are a code reviewer. Review changes for bugs, edge cases, and missing tests.',
    };
    fs.writeFileSync(subagentPath, JSON.stringify(subagentDef, null, 2), 'utf-8');
    createdFiles.push('.agents/subagents/project-reviewer.json');
  } else {
    skippedFiles.push('.agents/subagents/project-reviewer.json (already exists)');
  }

  return {
    projectRoot: cwd,
    metadata: meta,
    createdFiles,
    skippedFiles,
    configPath,
    agentsMdPath,
  };
}
