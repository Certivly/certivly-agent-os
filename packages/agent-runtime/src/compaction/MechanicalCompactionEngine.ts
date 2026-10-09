import type { LoopMessage } from '../loop/types';
import { redactSecrets } from '../trace/RunTracer';

export interface PreservedFileContent {
  path: string;
  content: string;
  lineCount: number;
  byteSize: number;
}

export interface FileOutlineStub {
  path: string;
  lineCount: number;
}

export interface MechanicalCompactionWorkingSet {
  preservedFiles: PreservedFileContent[];
  outlineStubs: FileOutlineStub[];
}

export interface MechanicalCompactionOptions {
  workingSetMaxBytes?: number;
  maxPreservedFiles?: number;
  verbatimRecentTurns?: number;
}

export interface MechanicalCompactionResult {
  compactedMessages: LoopMessage[];
  workingSet: MechanicalCompactionWorkingSet;
  tokensBeforeEstimate: number;
  tokensAfterEstimate: number;
  savingsRatio: number;
}

export class MechanicalCompactionEngine {
  public static readonly DEFAULT_WORKING_SET_MAX_BYTES = 40_000;
  public static readonly DEFAULT_MAX_PRESERVED_FILES = 4;
  public static readonly DEFAULT_VERBATIM_RECENT_TURNS = 4;

  /**
   * Deterministic mechanical context compaction (0 LLM tokens).
   * Rewrites conversational history into a structured <conversation_summary>
   * while keeping recent unedited file reads in an active working-set block.
   */
  public static compact(
    messages: LoopMessage[],
    options?: MechanicalCompactionOptions
  ): MechanicalCompactionResult {
    const workingSetMaxBytes = options?.workingSetMaxBytes ?? this.DEFAULT_WORKING_SET_MAX_BYTES;
    const maxPreservedFiles = options?.maxPreservedFiles ?? this.DEFAULT_MAX_PRESERVED_FILES;
    const verbatimRecentTurns = options?.verbatimRecentTurns ?? this.DEFAULT_VERBATIM_RECENT_TURNS;

    const tokensBefore = this.estimateTokens(messages);

    // 1. Separate system messages from turn messages
    const systemMessages = messages.filter((m) => m.role === 'system');
    const turnMessages = messages.filter((m) => m.role !== 'system');

    if (turnMessages.length <= verbatimRecentTurns * 2) {
      return {
        compactedMessages: messages,
        workingSet: { preservedFiles: [], outlineStubs: [] },
        tokensBeforeEstimate: tokensBefore,
        tokensAfterEstimate: tokensBefore,
        savingsRatio: 0,
      };
    }

    // Split history into older turns to compact and recent turns to preserve verbatim
    const splitIndex = Math.max(0, turnMessages.length - (verbatimRecentTurns * 2));
    const olderMessages = turnMessages.slice(0, splitIndex);
    const recentMessages = turnMessages.slice(splitIndex);

    // 2. Extract facts from older turns
    const userGoals: string[] = [];
    const filesModified = new Set<string>();
    const commandsRun: Array<{ command: string; exitCode?: number }> = [];
    const fileReadsMap = new Map<string, { content: string; order: number }>();
    let readOrder = 0;

    const callIdToPath = new Map<string, string>();

    for (const msg of olderMessages) {
      if (msg.role === 'user' && msg.content) {
        userGoals.push(msg.content.trim());
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          let args: any = {};
          try {
            args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
          } catch {
            args = {};
          }

          if (tc.name === 'write_file' || tc.name === 'edit_file' || tc.name === 'apply_patch') {
            if (args.path) filesModified.add(args.path);
          } else if (tc.name === 'run_command' && args.command) {
            commandsRun.push({ command: args.command });
          } else if (tc.name === 'read_file' && args.path) {
            if (!fileReadsMap.has(args.path)) {
              fileReadsMap.set(args.path, { content: '', order: ++readOrder });
            }
            if (tc.id) {
              callIdToPath.set(tc.id, args.path);
            }
          }
        }
      }

      if (msg.role === 'tool' && msg.content) {
        const pathFromId = msg.toolCallId ? callIdToPath.get(msg.toolCallId) : undefined;
        if (pathFromId && fileReadsMap.has(pathFromId)) {
          const entry = fileReadsMap.get(pathFromId)!;
          if (!entry.content) {
            entry.content = msg.content;
          }
        } else if (msg.name === 'read_file') {
          // Fallback if toolCallId was not preserved: assign to first empty read entry
          for (const [, data] of fileReadsMap.entries()) {
            if (!data.content) {
              data.content = msg.content;
              break;
            }
          }
        }
      }
    }

    // 3. Build Active Working Set:
    // Recent unedited files are preserved verbatim, older ones become outlines
    const preservedFiles: PreservedFileContent[] = [];
    const outlineStubs: FileOutlineStub[] = [];
    let currentWorkingSetBytes = 0;

    // Sort reads by most recent access
    const sortedReads = Array.from(fileReadsMap.entries())
      .filter(([p]) => !filesModified.has(p)) // unedited files only
      .sort((a, b) => b[1].order - a[1].order);

    for (const [filePath, data] of sortedReads) {
      const lineCount = (data.content.match(/\n/g) || []).length + 1;
      const byteSize = Buffer.byteLength(data.content, 'utf8');

      if (
        data.content &&
        preservedFiles.length < maxPreservedFiles &&
        currentWorkingSetBytes + byteSize <= workingSetMaxBytes
      ) {
        preservedFiles.push({
          path: filePath,
          content: data.content,
          lineCount,
          byteSize,
        });
        currentWorkingSetBytes += byteSize;
      } else {
        outlineStubs.push({
          path: filePath,
          lineCount,
        });
      }
    }

    // 4. Formulate the mechanical <conversation_summary>
    const summarySections: string[] = [
      '# Historical Session Summary (Mechanical Zero-Token Compaction)',
      '',
      '## Original User Requirements',
      ...userGoals.slice(0, 3).map((g) => `- ${redactSecrets(g)}`),
      '',
    ];

    if (filesModified.size > 0) {
      summarySections.push('## Files Modified in Prior Turns');
      for (const f of filesModified) {
        summarySections.push(`- \`${f}\` [COMPLETED]`);
      }
      summarySections.push('');
    }

    if (commandsRun.length > 0) {
      summarySections.push('## Commands Executed');
      for (const cmd of commandsRun.slice(-6)) {
        summarySections.push(`- \`${redactSecrets(cmd.command)}\``);
      }
      summarySections.push('');
    }

    if (preservedFiles.length > 0) {
      summarySections.push('## Active Working Set (Preserved File Contents)');
      for (const file of preservedFiles) {
        summarySections.push(`### File: ${file.path} (${file.lineCount} lines)`);
        summarySections.push('```');
        summarySections.push(file.content.slice(0, 8000));
        summarySections.push('```');
      }
      summarySections.push('');
    }

    if (outlineStubs.length > 0) {
      summarySections.push('## Historical File Outlines');
      for (const stub of outlineStubs) {
        summarySections.push(`- \`${stub.path}\` (${stub.lineCount} lines, previously examined)`);
      }
      summarySections.push('');
    }

    summarySections.push(
      'Historical context condensed above. Continue live problem-solving using available tools from the latest state.'
    );

    const summaryMessage: LoopMessage = {
      role: 'assistant',
      content: `<conversation_summary>\n${summarySections.join('\n')}\n</conversation_summary>`,
    };

    const compactedMessages = [
      ...systemMessages,
      summaryMessage,
      ...recentMessages,
    ];

    const tokensAfter = this.estimateTokens(compactedMessages);
    const savings = Math.max(0, (tokensBefore - tokensAfter) / (tokensBefore || 1));

    return {
      compactedMessages,
      workingSet: { preservedFiles, outlineStubs },
      tokensBeforeEstimate: tokensBefore,
      tokensAfterEstimate: tokensAfter,
      savingsRatio: Number(savings.toFixed(2)),
    };
  }

  private static estimateTokens(messages: LoopMessage[]): number {
    let chars = 0;
    for (const m of messages) {
      chars += (m.content || '').length;
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          chars += tc.name.length + (typeof tc.args === 'string' ? tc.args.length : 50);
        }
      }
    }
    return Math.ceil(chars / 4);
  }
}
