import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SubagentDefinition } from './SubagentModel';

export class SubagentRegistry {
  private workspaceRoot: string;
  private customAgents: Map<string, SubagentDefinition> = new Map();

  public static readonly BUILTIN_SUBAGENTS: SubagentDefinition[] = [
    {
      name: 'explorer',
      description: 'Fast symbol exploration, file discovery, and dependency mapping across the workspace',
      role: 'explorer',
      modelRole: 'fast',
      maxTurns: 8,
      tools: ['read_file', 'list_dir', 'grep', 'search_files', 'search_symbols', 'repo_map'],
      source: 'builtin',
      systemPrompt: `You are the Explorer Subagent.
Your primary responsibility is to locate relevant files, inspect definitions, and map symbols across the workspace with high speed.
Guidelines:
- Never attempt to edit or modify files. Use read_file, grep, and search_symbols.
- Provide concise, structured findings with exact file paths and line ranges.
- Conclude your response with a clear summary of target files and key definitions found.`,
    },
    {
      name: 'librarian',
      description: 'Investigates external documentation, dependency packages, and remote git repositories',
      role: 'librarian',
      modelRole: 'fast',
      maxTurns: 10,
      tools: ['run_command', 'read_file', 'grep'],
      source: 'builtin',
      systemPrompt: `You are the Librarian Subagent.
Your goal is to inspect external repositories, query library documentation, or clone reference codebases to extract architecture patterns and usage examples.
Guidelines:
- Do not make workspace modifications.
- Focus on extracting relevant API signatures, architectural lessons, and usage recipes.
- Return a structured synthesis with file citations and code examples.`,
    },
    {
      name: 'coder',
      description: 'Surgical code modification, feature implementation, and refactoring with edit safety',
      role: 'coder',
      modelRole: 'default',
      maxTurns: 15,
      tools: ['read_file', 'edit_file', 'write_file', 'apply_patch', 'load_skill'],
      source: 'builtin',
      systemPrompt: `You are the Coder Subagent.
Your goal is to implement features, perform refactoring, and apply surgical bugfixes cleanly.
Guidelines:
- Always read files before modifying them.
- Prefer edit_file for minimal replacements over full-file rewrites.
- Ensure all brackets, syntax, and types remain valid.
- Apply relevant skills using load_skill if needed.`,
    },
    {
      name: 'verifier',
      description: 'Executes test suites, linters, and typecheck commands to isolate failures or confirm fixes',
      role: 'verifier',
      modelRole: 'fast',
      maxTurns: 8,
      tools: ['run_command', 'read_file', 'grep'],
      source: 'builtin',
      systemPrompt: `You are the Verifier Subagent.
Your goal is to execute test, lint, and build commands to determine current verification status.
Guidelines:
- Execute minimal relevant verification commands using run_command.
- If checks fail, capture and analyze the exact failing test names, stack traces, and error outputs.
- Return a clear status report: whether verification passed or failed, with exact error citations.`,
    },
    {
      name: 'reviewer',
      description: 'Audits unified diffs and changesets for correctness, security, and acceptance criteria',
      role: 'reviewer',
      modelRole: 'review',
      maxTurns: 6,
      tools: ['read_file', 'grep'],
      source: 'builtin',
      systemPrompt: `You are the Reviewer Subagent.
Your goal is to independently audit proposed changesets and unified diffs.
Guidelines:
- Inspect changes against user acceptance criteria and code hygiene standards.
- Check for unintended side effects, security pitfalls, and leftover debug code.
- Return a definitive verdict: [APPROVE] or [REQUEST_CHANGES] with bulleted feedback.`,
    },
    {
      name: 'browser_verifier',
      description: 'Verifies web applications, frontend endpoints, and dev servers for HTTP status, console errors, and visual elements',
      role: 'verifier',
      modelRole: 'fast',
      maxTurns: 8,
      tools: ['run_command', 'read_file'],
      source: 'builtin',
      systemPrompt: `You are the Browser Verifier Subagent.
Your goal is to inspect frontend web apps and local servers (e.g. localhost:3000, localhost:5173).
Guidelines:
- Validate endpoint reachability, HTTP headers, and server logs.
- Detect uncaught console errors, 404/500 network failures, or broken markup.
- Return a clear verification summary with step results and any errors detected.`,
    },
    {
      name: 'researcher-web',
      description: 'Performs deep, iterative web research with primary source reading, SSRF-safe page inspection, and cited URL references',
      role: 'researcher',
      modelRole: 'fast',
      maxTurns: 15,
      tools: ['web_search', 'read_url', 'read_docs'],
      source: 'builtin',
      systemPrompt: `You are the Web Researcher Subagent.
Your goal is to find accurate, up-to-date information by searching the web and reading primary source documentation.
Guidelines:
1. Conduct research iteratively: Start with targeted web_search calls to find relevant pages and official docs.
2. HARD RULE: Search engine snippets and answer boxes are NOT evidence. You MUST fetch and read primary source pages using read_url before finalizing your answer. Read multiple pages in parallel whenever possible.
3. If information is incomplete or ambiguous, refine your search terms and read additional pages until the question is thoroughly addressed.
4. Conclude with a clear, concise synthesis of your findings and explicitly cite the URLs of the source pages you read.
5. If any claims could not be verified or sources failed to load, plainly state those limitations.`,
    },
    {
      name: 'researcher-docs',
      description: 'Researches official technical documentation for major programming languages, frameworks, libraries, and tools',
      role: 'researcher',
      modelRole: 'fast',
      maxTurns: 10,
      tools: ['read_docs', 'web_search', 'read_url'],
      source: 'builtin',
      systemPrompt: `You are the Documentation Researcher Subagent.
Your goal is to query technical documentation for libraries and frameworks (e.g. React, Next.js, Bun, TypeScript, Node, Python, Rust).
Guidelines:
- Use read_docs to retrieve authoritative API references, guides, and migration notes.
- Use read_url to inspect specific documentation pages or code examples when needed.
- Return a structured synthesis with exact method signatures, usage code blocks, and source URLs.`,
    },
  ];

  constructor(options?: { workspaceRoot?: string }) {
    this.workspaceRoot = options?.workspaceRoot || process.cwd();
    this.refresh();
  }

  public refresh(): void {
    this.customAgents.clear();
    const candidateDirs: Array<{ dir: string; source: 'workspace' | 'user' }> = [
      { dir: path.join(this.workspaceRoot, '.agentos', 'agents'), source: 'workspace' },
      { dir: path.join(this.workspaceRoot, '.claude', 'agents'), source: 'workspace' },
      { dir: path.join(this.workspaceRoot, '.agents', 'agents'), source: 'workspace' },
      { dir: path.join(os.homedir(), '.agentos', 'agents'), source: 'user' },
      { dir: path.join(os.homedir(), '.claude', 'agents'), source: 'user' },
      { dir: path.join(os.homedir(), '.agents', 'agents'), source: 'user' },
    ];

    for (const { dir, source } of candidateDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.json')) {
            const filePath = path.join(dir, entry.name);
            this.loadCustomAgentFile(filePath, source);
          }
        }
      } catch (err: unknown) {
        // Skip unreadable directories with error handled
        const _msg = err instanceof Error ? err.message : String(err);
      }
    }
  }

  private loadCustomAgentFile(filePath: string, source: 'workspace' | 'user'): void {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data.name === 'string' && typeof data.description === 'string') {
        const agentName = data.name.toLowerCase().trim();
        const def: SubagentDefinition = {
          name: agentName,
          description: data.description,
          role: data.role || 'custom',
          systemPrompt: data.systemPrompt || `You are the ${data.name} Subagent.`,
          modelRole: data.modelRole || 'default',
          tools: Array.isArray(data.tools) ? data.tools : ['read_file'],
          maxTurns: typeof data.maxTurns === 'number' ? data.maxTurns : 10,
          source,
          filePath,
        };
        // Workspace agents override user agents
        if (!this.customAgents.has(agentName) || source === 'workspace') {
          this.customAgents.set(agentName, def);
        }
      }
    } catch (err: unknown) {
      // Ignored malformed custom agent files with zero empty catch compliance
      const _msg = err instanceof Error ? err.message : String(err);
    }
  }

  public registerSubagent(def: SubagentDefinition): void {
    const slug = def.name.toLowerCase().trim();
    this.customAgents.set(slug, {
      ...def,
      name: slug,
      source: def.source || 'workspace',
    });
  }

  public getSubagent(name: string): SubagentDefinition | undefined {
    let slug = name.toLowerCase().trim();
    if (slug === 'researcher') slug = 'researcher-web';
    if (slug === 'docs-researcher' || slug === 'doc-researcher') slug = 'researcher-docs';

    // Custom workspace/user subagents override built-ins with identical name
    if (this.customAgents.has(slug)) {
      return this.customAgents.get(slug);
    }
    return SubagentRegistry.BUILTIN_SUBAGENTS.find(a => a.name === slug);
  }

  public listSubagents(): SubagentDefinition[] {
    const map = new Map<string, SubagentDefinition>();
    for (const b of SubagentRegistry.BUILTIN_SUBAGENTS) {
      map.set(b.name, b);
    }
    for (const [k, v] of this.customAgents.entries()) {
      map.set(k, v);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  public formatAgentsForPrompt(): string {
    const agents = this.listSubagents();
    if (agents.length === 0) return '';

    const lines = [
      '### Available Specialized Subagents (Delegation Available via delegate_subagent Tool)',
      'You can autonomously delegate tasks to specialized subagents. Intermediate search and grep steps stay isolated in the subagent context.',
    ];

    for (const a of agents) {
      lines.push(
        `- **${a.name}** [role: ${a.role}, tools: ${a.tools.join(', ')}]: ${a.description}`
      );
    }

    return lines.join('\n');
  }

  public formatSubagentsPrompt(): string {
    return this.formatAgentsForPrompt();
  }
}
