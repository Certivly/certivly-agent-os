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
  shouldHaltLoop?: boolean;
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
  private readonly CIRCUIT_BREAKER_LIMIT: number;

  constructor(options?: { repetitionThreshold?: number; circuitBreakerLimit?: number }) {
    this.REPETITION_THRESHOLD = options?.repetitionThreshold ?? 3;
    this.CIRCUIT_BREAKER_LIMIT = options?.circuitBreakerLimit ?? 6;
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

    const last = this.history[this.history.length - 1];

    // 1. Tool call repetition: count consecutive identical tool + args
    let toolConsecutive = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].toolName === last.toolName && this.history[i].argsHash === last.argsHash) {
        toolConsecutive++;
      } else {
        break;
      }
    }

    if (toolConsecutive >= this.REPETITION_THRESHOLD) {
      const shouldHalt = toolConsecutive >= this.CIRCUIT_BREAKER_LIMIT;
      return {
        isLooping: true,
        loopType: 'tool_repetition',
        repetitionCount: toolConsecutive,
        shouldHaltLoop: shouldHalt,
        interventionPrompt: shouldHalt
          ? `[CIRCUIT BREAKER] Tool '${last.toolName}' was repeatedly invoked with identical arguments ${toolConsecutive} times without progress. Execution halted to protect session budget.`
          : `[ANTI-LOOP INTERVENTION] You have executed tool '${last.toolName}' with identical arguments ${toolConsecutive} times consecutively. Stop repeating this query. Pivot to an alternative exploration or implementation hypothesis.`,
      };
    }

    // 2. Error churn: count consecutive identical error output
    let errorConsecutive = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].outputHash === last.outputHash && last.outputHash !== this.hashString('')) {
        errorConsecutive++;
      } else {
        break;
      }
    }

    if (errorConsecutive >= this.REPETITION_THRESHOLD) {
      const shouldHalt = errorConsecutive >= this.CIRCUIT_BREAKER_LIMIT;
      return {
        isLooping: true,
        loopType: 'error_churn',
        repetitionCount: errorConsecutive,
        shouldHaltLoop: shouldHalt,
        interventionPrompt: shouldHalt
          ? `[CIRCUIT BREAKER] Identical error output received across ${errorConsecutive} consecutive turns. Halting loop to prevent spinning.`
          : `[ANTI-LOOP INTERVENTION] You have received identical command/verification error output across ${errorConsecutive} consecutive actions. Your current fix attempts are not resolving the underlying cause. Stop repeating the same approach, re-read surrounding code, and adopt a different fix strategy.`,
      };
    }

    // 3. Diff thrashing: repeatedly modifying the same file back and forth across turns
    const recent = this.history.slice(-this.REPETITION_THRESHOLD);
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
    let target = obj;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const { instructions: _i, comment: _c, explanation: _e, ...rest } = obj as Record<string, unknown>;
      target = rest;
    }
    const canonicalString = this.canonicalizeJson(target);
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
