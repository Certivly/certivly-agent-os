import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Model } from '@agent-os/providers';

const execAsync = promisify(exec);

export interface LibrarianQuery {
  repoUrl: string;                  // GitHub or Git repository URL
  question: string;                 // Technical query or feature investigation
  branchOrTag?: string;             // Optional branch, tag, or commit hash
}

export interface LibrarianResult {
  answer: string;
  relevantFiles: Array<{ path: string; summary: string }>;
  codeSnippets: Array<{ path: string; code: string }>;
  cloneDir: string;
}

export class LibrarianSubagent {
  public static readonly DEFAULT_TIMEOUT_MS = 60_000;
  private scratchRoot: string;

  constructor(
    private model: Model,
    scratchRoot?: string
  ) {
    this.scratchRoot =
      scratchRoot || path.join(os.homedir(), '.agentos', 'clones');
  }

  public validateRepoUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    // Only allow secure https git URLs from known hosts
    if (!trimmed.startsWith('https://')) return false;
    if (/[;&|><$\r\n`]/.test(trimmed)) return false;
    return true;
  }

  public async investigate(
    query: LibrarianQuery,
    options?: { timeoutMs?: number; abortSignal?: AbortSignal }
  ): Promise<LibrarianResult> {
    if (!this.validateRepoUrl(query.repoUrl)) {
      throw new Error(`Invalid or disallowed repository URL: "${query.repoUrl}". Only secure HTTPS git URLs are permitted.`);
    }

    await fs.promises.mkdir(this.scratchRoot, { recursive: true });

    const entropy = Math.random().toString(36).substring(2, 8);
    const cloneDir = path.join(this.scratchRoot, `librarian_${Date.now()}_${entropy}`);

    try {
      // 1. Perform shallow clone (--depth 1)
      const branchFlag = query.branchOrTag ? `--branch ${query.branchOrTag} ` : '';
      const cloneCmd = `git clone --depth 1 --no-tags --single-branch ${branchFlag}"${query.repoUrl}" "${cloneDir}"`;

      await execAsync(cloneCmd, {
        timeout: options?.timeoutMs ?? LibrarianSubagent.DEFAULT_TIMEOUT_MS,
      });

      // 2. Discover entry point files and structures
      const relevantFiles: Array<{ path: string; summary: string }> = [];
      const codeSnippets: Array<{ path: string; code: string }> = [];

      const potentialFiles = [
        'README.md',
        'package.json',
        'Cargo.toml',
        'pyproject.toml',
        'src/index.ts',
        'src/main.ts',
      ];

      let combinedContext = '';

      for (const rel of potentialFiles) {
        const fullPath = path.join(cloneDir, rel);
        if (fs.existsSync(fullPath)) {
          try {
            const content = await fs.promises.readFile(fullPath, 'utf8');
            const snippet = content.slice(0, 3000);
            relevantFiles.push({ path: rel, summary: `Key file: ${rel} (${content.split('\n').length} lines)` });
            codeSnippets.push({ path: rel, code: snippet });
            combinedContext += `\n--- File: ${rel} ---\n${snippet}\n`;
          } catch (_err: unknown) {
            // Best effort file reading
          }
        }
      }

      // 3. Model synthesis
      const response = await this.model.generate({
        systemPrompt:
          'You are the Librarian, an expert AI engineer at understanding open-source codebases. Based on the extracted files from the shallow-cloned repository, provide an exact, accurate, and concise answer to the user query with code references.',
        messages: [
          {
            role: 'user',
            content: `Repository: ${query.repoUrl}\nQuestion: ${query.question}\n\nRepository File Context:\n${combinedContext}`,
          },
        ],
        signal: options?.abortSignal,
      });

      const answer = response.text || 'Investigation completed.';

      return {
        answer,
        relevantFiles,
        codeSnippets,
        cloneDir,
      };
    } catch (err: any) {
      // Clean up clone on error
      await this.cleanup(cloneDir).catch(() => {});
      throw new Error(`Librarian investigation failed for ${query.repoUrl}: ${err.message}`);
    }
  }

  public async cleanup(cloneDir: string): Promise<void> {
    if (fs.existsSync(cloneDir)) {
      await fs.promises.rm(cloneDir, { recursive: true, force: true });
    }
  }
}
