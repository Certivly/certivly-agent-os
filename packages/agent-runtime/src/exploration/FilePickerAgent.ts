import * as fs from 'fs';
import * as path from 'path';
import type { Model, GenerationRequest } from '@agent-os/providers';

export interface FilePickerCandidate {
  path: string;
  relevanceScore: number; // 0.0 to 1.0
  reason: string;
  suggestedAction: 'edit' | 'read_context' | 'test_verify';
}

export interface FilePickerResult {
  candidates: FilePickerCandidate[];
  summary: string;
  durationMs: number;
  tokensUsed: number;
}

export interface FilePickerOptions {
  maxCandidates?: number;
  maxScanDepth?: number;
  maxFilesToConsider?: number;
}

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.agentos',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.idea',
  '.vscode',
]);

export class FilePickerAgent {
  private readonly maxCandidates: number;
  private readonly maxScanDepth: number;
  private readonly maxFilesToConsider: number;

  constructor(
    private cheapModel: Model,
    private workspaceRoot: string,
    options: FilePickerOptions = {}
  ) {
    this.maxCandidates = options.maxCandidates ?? 5;
    this.maxScanDepth = options.maxScanDepth ?? 6;
    this.maxFilesToConsider = options.maxFilesToConsider ?? 40;
  }

  /**
   * Fast discovery routine using lightweight heuristic pre-filtering and cheap model inference
   */
  async discoverRelevantFiles(userInput: string): Promise<FilePickerResult> {
    const startTime = Date.now();
    const allFiles = this.scanWorkspaceFiles(this.workspaceRoot, 0);

    if (allFiles.length === 0) {
      return {
        candidates: [],
        summary: 'No workspace files discovered',
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
      };
    }

    // Heuristically pre-score files against user input keywords
    const candidatePool = this.prefilterCandidates(allFiles, userInput).slice(0, this.maxFilesToConsider);

    const systemPrompt = `You are a high-speed file discovery agent.
Your sole job is to locate the exact 2-5 files in this repository needed to address the user request.
Do NOT write code. Do NOT implement changes.

Candidate paths available in workspace:
${candidatePool.map((f) => `- ${f}`).join('\n')}

Output ONLY a JSON payload matching this schema:
{
  "candidates": [
    {
      "path": "relative/path/to/file.ts",
      "relevanceScore": 0.95,
      "reason": "Brief explanation of why this file is relevant",
      "suggestedAction": "edit"
    }
  ],
  "summary": "Brief explanation of the subsystem"
}`;

    const request: GenerationRequest = {
      systemPrompt,
      systemPromptCacheControl: { type: 'ephemeral' },
      messages: [
        {
          role: 'user',
          content: `Identify the candidate files needed for: ${userInput}`,
        },
      ],
      maxOutputTokens: 1024,
    };

    let tokensUsed = 0;
    try {
      const response = await this.cheapModel.generate(request);
      tokensUsed = (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0);

      const parsed = this.parseResponse(response.text, candidatePool);
      if (parsed && parsed.candidates.length > 0) {
        return {
          candidates: parsed.candidates.slice(0, this.maxCandidates),
          summary: parsed.summary || `Selected ${parsed.candidates.length} candidate file(s)`,
          durationMs: Date.now() - startTime,
          tokensUsed,
        };
      }
    } catch {
      // Graceful fallback to heuristic selection if model invocation fails
    }

    // Heuristic fallback
    const fallbackCandidates: FilePickerCandidate[] = candidatePool.slice(0, this.maxCandidates).map((p, idx) => ({
      path: p,
      relevanceScore: Math.max(0.3, 0.9 - idx * 0.15),
      reason: 'Matched file query heuristics',
      suggestedAction: idx === 0 ? 'edit' : 'read_context',
    }));

    return {
      candidates: fallbackCandidates,
      summary: `Heuristically identified ${fallbackCandidates.length} candidate file(s)`,
      durationMs: Date.now() - startTime,
      tokensUsed,
    };
  }

  private scanWorkspaceFiles(dir: string, depth: number): string[] {
    if (depth > this.maxScanDepth || !fs.existsSync(dir)) {
      return [];
    }

    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!DEFAULT_IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            files.push(...this.scanWorkspaceFiles(path.join(dir, entry.name), depth + 1));
          }
        } else if (entry.isFile()) {
          const relativePath = path.relative(this.workspaceRoot, path.join(dir, entry.name)).replace(/\\/g, '/');
          files.push(relativePath);
        }
      }
    } catch {
      // Ignore read errors
    }
    return files;
  }

  private prefilterCandidates(files: string[], query: string): string[] {
    const rawTokens = query
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !['add', 'fix', 'the', 'for', 'with', 'and', 'from', 'file', 'files'].includes(t));

    if (rawTokens.length === 0) {
      return files;
    }

    const scored = files.map((file) => {
      const lower = file.toLowerCase();
      let score = 0;
      for (const token of rawTokens) {
        if (lower.includes(token)) {
          score += 2;
          const baseName = path.basename(lower);
          if (baseName.includes(token)) {
            score += 3;
          }
        }
      }
      return { file, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.file);
  }

  private parseResponse(
    text: string,
    validPool: string[]
  ): { candidates: FilePickerCandidate[]; summary?: string } | null {
    if (!text) return null;

    let jsonStr = text.trim();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        jsonStr = text.slice(start, end + 1);
      }
    }

    try {
      const obj = JSON.parse(jsonStr);
      if (Array.isArray(obj.candidates)) {
        const normalizedPool = new Set(validPool.map((p) => p.toLowerCase().replace(/\\/g, '/')));
        const candidates: FilePickerCandidate[] = [];

        for (const c of obj.candidates) {
          if (typeof c.path === 'string') {
            const cleanPath = c.path.replace(/\\/g, '/').replace(/^\.\//, '');
            const existsLocally = fs.existsSync(path.resolve(this.workspaceRoot, cleanPath));
            if (normalizedPool.has(cleanPath.toLowerCase()) || existsLocally) {
              candidates.push({
                path: cleanPath,
                relevanceScore: typeof c.relevanceScore === 'number' ? c.relevanceScore : 0.8,
                reason: typeof c.reason === 'string' ? c.reason : 'Identified by file picker',
                suggestedAction: ['edit', 'read_context', 'test_verify'].includes(c.suggestedAction)
                  ? c.suggestedAction
                  : 'edit',
              });
            }
          }
        }

        return {
          candidates,
          summary: typeof obj.summary === 'string' ? obj.summary : undefined,
        };
      }
    } catch {
      // JSON parse failed
    }
    return null;
  }
}
