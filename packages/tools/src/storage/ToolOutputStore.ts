import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ToolOutputBounds {
  maxLines: number;
  maxBytes: number;
}

export interface BoundedToolOutput {
  preview: string;
  isTruncated: boolean;
  spilloverPath?: string;
  totalLines: number;
  totalBytes: number;
}

export interface BoundOutputOptions extends Partial<ToolOutputBounds> {
  workspaceRoot?: string;
  toolName?: string;
}

export class ToolOutputStore {
  public static readonly DEFAULT_MAX_LINES = 2_000;
  public static readonly DEFAULT_MAX_BYTES = 50 * 1024; // 50 KB
  public static readonly DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  public static readonly MANAGED_DIR_NAME = 'tool-output';

  private defaultStorageDir?: string;

  constructor(defaultStorageDir?: string) {
    this.defaultStorageDir = defaultStorageDir;
  }

  public resolveStorageDir(workspaceRoot?: string): string {
    if (this.defaultStorageDir) {
      return this.defaultStorageDir;
    }
    if (workspaceRoot && fs.existsSync(workspaceRoot)) {
      return path.join(workspaceRoot, '.agentos', ToolOutputStore.MANAGED_DIR_NAME);
    }
    // Fall back to user home directory
    return path.join(os.homedir(), '.agentos', ToolOutputStore.MANAGED_DIR_NAME);
  }

  public static countLines(text: string): number {
    if (!text) return 0;
    let count = 1;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) {
        // '\n'
        count++;
      }
    }
    return count;
  }

  private takePrefixBytes(input: string, maxBytes: number): string {
    let bytes = 0;
    let content = '';
    for (const char of input) {
      const charBytes = Buffer.byteLength(char, 'utf8');
      if (bytes + charBytes > maxBytes) break;
      content += char;
      bytes += charBytes;
    }
    return content;
  }

  private takeSuffixBytes(input: string, maxBytes: number): string {
    let bytes = 0;
    const chars: string[] = [];
    const array = Array.from(input);
    for (let i = array.length - 1; i >= 0; i--) {
      const char = array[i];
      const charBytes = Buffer.byteLength(char, 'utf8');
      if (bytes + charBytes > maxBytes) break;
      chars.unshift(char);
      bytes += charBytes;
    }
    return chars.join('');
  }

  private preview(
    text: string,
    maxLines: number,
    maxBytes: number
  ): { head: string; tail: string } {
    const lines = text.split('\n');
    const headLineCount = Math.ceil(maxLines / 2);
    const tailLineCount = Math.floor(maxLines / 2);

    let headLines = lines.slice(0, headLineCount).join('\n');
    let tailLines = tailLineCount > 0 ? lines.slice(lines.length - tailLineCount).join('\n') : '';

    if (Buffer.byteLength(headLines + '\n' + tailLines, 'utf8') <= maxBytes) {
      return { head: headLines, tail: tailLines };
    }

    const headBytes = Math.ceil(maxBytes / 2);
    const tailBytes = Math.floor(maxBytes / 2);
    return {
      head: this.takePrefixBytes(headLines, headBytes),
      tail: this.takeSuffixBytes(tailLines, tailBytes),
    };
  }

  /**
   * Evaluates text against line count and byte size limits.
   * If within bounds, returns text as-is.
   * If exceeding, writes full text to disk and produces a bidirectional preview
   * (head + tail) with a pointer marker to the spillover file.
   */
  public async boundOutput(
    rawOutput: string,
    options?: BoundOutputOptions
  ): Promise<BoundedToolOutput> {
    const maxLines = options?.maxLines ?? ToolOutputStore.DEFAULT_MAX_LINES;
    const maxBytes = options?.maxBytes ?? ToolOutputStore.DEFAULT_MAX_BYTES;

    const totalLines = ToolOutputStore.countLines(rawOutput);
    const totalBytes = Buffer.byteLength(rawOutput, 'utf8');

    if (totalLines <= maxLines && totalBytes <= maxBytes) {
      return {
        preview: rawOutput,
        isTruncated: false,
        totalLines,
        totalBytes,
      };
    }

    // Exceeded bounds: spill to disk
    const targetDir = this.resolveStorageDir(options?.workspaceRoot);
    await fs.promises.mkdir(targetDir, { recursive: true });

    const prefix = options?.toolName ? `tool_${options.toolName}` : 'tool';
    const timestamp = Date.now();
    const entropy = Math.random().toString(36).substring(2, 8);
    const filename = `${prefix}_${timestamp}_${entropy}.txt`;
    const spilloverPath = path.join(targetDir, filename);

    await fs.promises.writeFile(spilloverPath, rawOutput, 'utf8');

    // Generate balanced preview
    const availableLines = Math.max(4, maxLines - 4);
    const markerSkeleton = `... [output truncated. Full output saved to: ${spilloverPath}] ...`;
    const markerBytesEstimate = Buffer.byteLength(markerSkeleton, 'utf8') + 32;
    const availableBytes = Math.max(128, maxBytes - markerBytesEstimate);

    const { head, tail } = this.preview(rawOutput, availableLines, availableBytes);

    const headLinesCount = ToolOutputStore.countLines(head);
    const tailLinesCount = tail ? ToolOutputStore.countLines(tail) : 0;
    const omittedLines = Math.max(0, totalLines - (headLinesCount + tailLinesCount));
    const previewBytes = Buffer.byteLength(head + (tail ? tail : ''), 'utf8');
    const omittedBytes = Math.max(0, totalBytes - previewBytes);

    const marker = `... [output truncated: ${omittedLines} lines (${omittedBytes} bytes) omitted. Full output saved to: ${spilloverPath}] ...`;

    const preview = tail ? `${head}\n\n${marker}\n\n${tail}` : `${head}\n\n${marker}`;

    return {
      preview,
      isTruncated: true,
      spilloverPath,
      totalLines,
      totalBytes,
    };
  }

  /**
   * Cleans up expired spillover files older than retentionMs.
   */
  public async cleanupExpired(
    workspaceRoot?: string,
    retentionMs: number = ToolOutputStore.DEFAULT_RETENTION_MS
  ): Promise<number> {
    const targetDir = this.resolveStorageDir(workspaceRoot);
    if (!fs.existsSync(targetDir)) return 0;

    let removedCount = 0;
    const now = Date.now();
    const cutoff = now - retentionMs;

    try {
      const files = await fs.promises.readdir(targetDir);
      for (const file of files) {
        if (!file.startsWith('tool_')) continue;
        const filePath = path.join(targetDir, file);
        try {
          const stat = await fs.promises.stat(filePath);
          if (stat.mtimeMs < cutoff) {
            await fs.promises.unlink(filePath);
            removedCount++;
          }
        } catch (err: unknown) {
          // File may have been removed or locked concurrently
          const _msg = err instanceof Error ? err.message : String(err);
        }
      }
    } catch (err: unknown) {
      // Best-effort cleanup
      const _msg = err instanceof Error ? err.message : String(err);
    }

    return removedCount;
  }
}

export const toolOutputStore = new ToolOutputStore();
