import * as crypto from 'crypto';

export interface ActionRecord {
  turn: number;
  toolName: string;
  argsHash: string;
  outputHash: string;
  filesModified: string[];
}

export type LoopType = 'tool_repetition' | 'diff_thrashing' | 'error_churn';

export interface AntiLoopStatus {
  isLooping: boolean;
  loopType?: LoopType;
  repetitionCount: number;
  interventionPrompt?: string;
}

export interface RecordActionParams {
  turn: number;
  toolName: string;
  args: unknown;
  output: string;
  filesModified?: string[];
  isError?: boolean;
}

export class AntiLoopMonitor {
  private history: ActionRecord[] = [];
  private readonly REPETITION_THRESHOLD: number;

  constructor(options?: { repetitionThreshold?: number }) {
    this.REPETITION_THRESHOLD = options?.repetitionThreshold ?? 3;
  }

  public recordAction(action: RecordActionParams): AntiLoopStatus {
    const argsHash = this.hashObject(action.args);
    const outputHash = this.hashString(action.output);

    this.history.push({
      turn: action.turn,
      toolName: action.toolName,
      argsHash,
      outputHash,
      filesModified: action.filesModified ?? [],
    });

    return this.evaluate();
  }

  public evaluate(): AntiLoopStatus {
    if (this.history.length < this.REPETITION_THRESHOLD) {
      return { isLooping: false, repetitionCount: 0 };
    }

    const recent = this.history.slice(-this.REPETITION_THRESHOLD);

    // 1. Tool call repetition: same tool called with identical arguments across threshold turns
    const allSameToolAndArgs = recent.every(
      (r) => r.toolName === recent[0].toolName && r.argsHash === recent[0].argsHash
    );
    if (allSameToolAndArgs) {
      return {
        isLooping: true,
        loopType: 'tool_repetition',
        repetitionCount: this.REPETITION_THRESHOLD,
        interventionPrompt: `[ANTI-LOOP INTERVENTION] You have executed tool '${recent[0].toolName}' with identical arguments ${this.REPETITION_THRESHOLD} times consecutively. Stop repeating this query. Pivot to an alternative exploration or implementation hypothesis.`,
      };
    }

    // 2. Error churn: identical error output across threshold turns
    const allSameOutput = recent.every((r) => r.outputHash === recent[0].outputHash);
    if (allSameOutput && recent[0].outputHash !== this.hashString('')) {
      return {
        isLooping: true,
        loopType: 'error_churn',
        repetitionCount: this.REPETITION_THRESHOLD,
        interventionPrompt: `[ANTI-LOOP INTERVENTION] You have received identical command/verification error output across ${this.REPETITION_THRESHOLD} consecutive actions. Your current fix attempts are not resolving the underlying cause. Stop repeating the same approach, re-read surrounding code, and adopt a different fix strategy.`,
      };
    }

    // 3. Diff thrashing: repeatedly modifying the same file back and forth across turns
    const filesModifiedLists = recent.map((r) => r.filesModified).filter((f) => f.length > 0);
    if (filesModifiedLists.length >= this.REPETITION_THRESHOLD) {
      const allTouchSameFile = filesModifiedLists.every((fl) =>
        fl.some((file) => filesModifiedLists[0].includes(file))
      );
      if (allTouchSameFile) {
        return {
          isLooping: true,
          loopType: 'diff_thrashing',
          repetitionCount: this.REPETITION_THRESHOLD,
          interventionPrompt: `[ANTI-LOOP INTERVENTION] Diff thrashing detected: repeatedly modifying and reverting identical file targets without passing verification. Step back, re-verify baseline requirements, and consider an alternative architecture.`,
        };
      }
    }

    return { isLooping: false, repetitionCount: 0 };
  }

  public getHistory(): ActionRecord[] {
    return [...this.history];
  }

  public reset(): void {
    this.history = [];
  }

  private hashObject(obj: unknown): string {
    const canonicalString = this.canonicalizeJson(obj);
    return crypto.createHash('sha256').update(canonicalString).digest('hex').slice(0, 16);
  }

  private hashString(str: string): string {
    return crypto.createHash('sha256').update(str.trim()).digest('hex').slice(0, 16);
  }

  private canonicalizeJson(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return `[${obj.map((item) => this.canonicalizeJson(item)).join(',')}]`;
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${this.canonicalizeJson((obj as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
}
