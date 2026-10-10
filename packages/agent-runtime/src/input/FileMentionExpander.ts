import * as fs from 'fs';
import * as path from 'path';

export interface AttachedFileContext {
  path: string;
  bytes: number;
  lineCount: number;
  truncated: boolean;
  content: string;
}

export interface FileMentionExpansionResult {
  originalInput: string;
  expandedInput: string;
  attachedFiles: AttachedFileContext[];
}

export interface FileMentionExpanderOptions {
  workspaceRoot: string;
  maxBytesPerFile?: number; // Default 32 KB
  maxFiles?: number;        // Default 10
}

/**
 * FileMentionExpander (Learned from Qwen Code and Claude Code)
 *
 * Scans user prompts for '@path/to/file' references, extracts and bounds file content,
 * and attaches structured <context_file> blocks so the model has immediate code context
 * without burning roundtrips asking the agent to read files first.
 */
export class FileMentionExpander {
  public static readonly DEFAULT_MAX_BYTES = 32 * 1024; // 32 KB
  public static readonly DEFAULT_MAX_FILES = 10;

  // Regex matches '@path/to/file.ext' preceded by start of line or whitespace
  // Avoids emails (e.g. user@example.com) by requiring leading boundary and no leading non-whitespace
  private static readonly MENTION_REGEX = /(?:^|\s)@((?:\.?\.?[\w\-./\\]+)\.([a-zA-Z0-9_\-]+))/g;

  /**
   * Extracts raw candidate file paths referenced with '@'
   */
  public static extractCandidatePaths(input: string): string[] {
    const candidates: string[] = [];
    const regex = new RegExp(this.MENTION_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      if (match[1]) {
        candidates.push(match[1]);
      }
    }

    return [...new Set(candidates)];
  }

  /**
   * Expands file mentions in user input by attaching valid workspace files.
   */
  public static expand(
    input: string,
    options: FileMentionExpanderOptions
  ): FileMentionExpansionResult {
    const { workspaceRoot, maxBytesPerFile = this.DEFAULT_MAX_BYTES, maxFiles = this.DEFAULT_MAX_FILES } = options;
    const candidates = this.extractCandidatePaths(input);

    if (candidates.length === 0) {
      return {
        originalInput: input,
        expandedInput: input,
        attachedFiles: [],
      };
    }

    const attachedFiles: AttachedFileContext[] = [];

    for (const rawPath of candidates) {
      if (attachedFiles.length >= maxFiles) break;

      // Normalize path
      const normalized = path.normalize(rawPath).replace(/^[\\/]+/, '');
      const fullPath = path.resolve(workspaceRoot, normalized);

      // Security check: ensure file is within workspace root
      const relative = path.relative(workspaceRoot, fullPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        continue;
      }

      if (!fs.existsSync(fullPath)) {
        continue;
      }

      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        const rawContent = fs.readFileSync(fullPath, 'utf8');
        const lines = rawContent.split(/\r?\n/);
        let finalContent = rawContent;
        let truncated = false;

        const byteSize = Buffer.byteLength(rawContent, 'utf8');
        if (byteSize > maxBytesPerFile) {
          truncated = true;
          const head = lines.slice(0, 100).join('\n');
          const tail = lines.slice(-50).join('\n');
          const omitted = Math.max(0, lines.length - 150);
          finalContent = `${head}\n\n[... ${omitted} lines omitted (${Math.round(byteSize / 1024)} KB total). Use read_file to inspect middle sections ...]\n\n${tail}`;
        }

        attachedFiles.push({
          path: relative.replace(/\\/g, '/'),
          bytes: byteSize,
          lineCount: lines.length,
          truncated,
          content: finalContent,
        });
      } catch (_err: unknown) {
        // Skip unreadable files safely
      }
    }

    if (attachedFiles.length === 0) {
      return {
        originalInput: input,
        expandedInput: input,
        attachedFiles: [],
      };
    }

    // Build attached file context blocks
    const attachmentsSection = attachedFiles
      .map(
        f =>
          `<context_file path="${f.path}" lines="${f.lineCount}" bytes="${f.bytes}"${f.truncated ? ' truncated="true"' : ''}>\n${f.content}\n</context_file>`
      )
      .join('\n\n');

    const expandedInput = `${input.trim()}\n\n[Attached File Context from @mentions]:\n${attachmentsSection}`;

    return {
      originalInput: input,
      expandedInput,
      attachedFiles,
    };
  }
}
