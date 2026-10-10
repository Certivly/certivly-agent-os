import * as vm from 'node:vm';
import { ToolCatalog } from '../catalog/ToolCatalog';
import type { CodeModeExecutionLimits, CodeModeResult, ToolCallAudit, CodeModeDiagnostic } from '../types';
import type { ToolContext } from '@agent-os/tools';
import { stdlib, Collections, Strings, MathUtils, JsonUtils, PromiseUtils, DateUtils, UrlUtils, ValueUtils } from '../stdlib';

export class CodeModeInterpreter {
  public static readonly DEFAULT_TIMEOUT_MS = 15_000;
  public static readonly DEFAULT_MAX_TOOL_CALLS = 50;
  public static readonly DEFAULT_MAX_OUTPUT_BYTES = 50 * 1024; // 50 KB
  public static readonly DEFAULT_CONCURRENCY_LIMIT = 8;

  constructor(private catalog: ToolCatalog) {}

  private validateSyntaxSecurity(code: string): CodeModeDiagnostic | null {
    // Basic static syntax and security checks
    if (/\beval\s*\(/.test(code)) {
      return { kind: 'UnsupportedSyntax', message: 'Use of "eval" is prohibited in CodeMode' };
    }
    if (/\bFunction\s*\(/.test(code)) {
      return { kind: 'UnsupportedSyntax', message: 'Use of "Function" constructor is prohibited in CodeMode' };
    }
    if (/\bimport\s*\(/.test(code)) {
      return { kind: 'UnsupportedSyntax', message: 'Dynamic "import()" is prohibited in CodeMode' };
    }
    if (/\bprocess\./.test(code)) {
      return { kind: 'UnsupportedSyntax', message: 'Access to "process" global is prohibited in CodeMode' };
    }
    if (/\brequire\s*\(/.test(code)) {
      return { kind: 'UnsupportedSyntax', message: 'Use of "require()" is prohibited in CodeMode' };
    }
    return null;
  }

  public async execute(
    code: string,
    context?: ToolContext,
    limits?: CodeModeExecutionLimits
  ): Promise<CodeModeResult> {
    const timeoutMs = limits?.timeoutMs ?? CodeModeInterpreter.DEFAULT_TIMEOUT_MS;
    const maxToolCalls = limits?.maxToolCalls ?? CodeModeInterpreter.DEFAULT_MAX_TOOL_CALLS;
    const maxOutputBytes = limits?.maxOutputBytes ?? CodeModeInterpreter.DEFAULT_MAX_OUTPUT_BYTES;
    const concurrencyLimit = limits?.concurrencyLimit ?? CodeModeInterpreter.DEFAULT_CONCURRENCY_LIMIT;

    const startTime = Date.now();
    const logs: string[] = [];
    const toolCalls: ToolCallAudit[] = [];
    let toolCallsCount = 0;
    let activeToolCalls = 0;
    const waitQueue: Array<() => void> = [];

    const acquireSlot = async (): Promise<void> => {
      if (activeToolCalls < concurrencyLimit) {
        activeToolCalls++;
        return;
      }
      return new Promise<void>(resolve => {
        waitQueue.push(() => {
          activeToolCalls++;
          resolve();
        });
      });
    };

    const releaseSlot = (): void => {
      activeToolCalls--;
      const next = waitQueue.shift();
      if (next) {
        next();
      }
    };

    // 1. Security validation
    const securityError = this.validateSyntaxSecurity(code);
    if (securityError) {
      return {
        ok: false,
        error: securityError,
        logs,
        toolCalls,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Prepare Tool Proxy
    const effectiveContext: ToolContext = context || { workspaceRoot: process.cwd() };

    const toolsProxy = new Proxy({}, {
      get: (_, prop: string | symbol) => {
        if (typeof prop !== 'string') return undefined;
        const toolName = prop;
        const tool = this.catalog.getTool(toolName);

        if (!tool) {
          return async () => {
            const err = `Tool "${toolName}" is not registered in the CodeMode catalog. Use $codemode.search("${toolName}") to find available tools.`;
            logs.push(`[CodeMode Error] ${err}`);
            throw new Error(err);
          };
        }

        return async (args: Record<string, unknown> = {}) => {
          if (toolCallsCount >= maxToolCalls) {
            const err = `Tool call limit exceeded: maximum ${maxToolCalls} tool calls permitted per execution`;
            logs.push(`[CodeMode Limit] ${err}`);
            throw new Error(err);
          }

          toolCallsCount++;
          await acquireSlot();
          const callStart = Date.now();

          try {
            const res = await tool.execute(args, effectiveContext);
            const durationMs = Date.now() - callStart;

            toolCalls.push({
              name: toolName,
              args,
              durationMs,
              success: !res.isError,
              error: res.isError ? res.content : undefined,
            });

            if (res.isError) {
              throw new Error(`Tool "${toolName}" failed: ${res.content}`);
            }

            // Return structured data if present, otherwise parsed JSON or raw string
            if (res.data !== undefined) return res.data;
            try {
              return JSON.parse(res.content);
            } catch (_parseErr: unknown) {
              // Return raw string if content is not JSON
              return res.content;
            }
          } catch (e: any) {
            const durationMs = Date.now() - callStart;
            toolCalls.push({
              name: toolName,
              args,
              durationMs,
              success: false,
              error: e.message || String(e),
            });
            throw e;
          } finally {
            releaseSlot();
          }
        };
      },
    });

    // 3. Prepare $codemode helper
    const codemodeHelper = {
      search: (query: string) => this.catalog.search(query),
      listTools: () => this.catalog.listTools().map(t => this.catalog.toSignature(t)),
    };

    // 4. Construct Sandbox Context with full stdlib
    const sandbox: Record<string, unknown> = {
      // Safe standard globals
      Object,
      Array,
      String,
      Number,
      Boolean,
      Date,
      Math,
      RegExp,
      JSON,
      Map,
      Set,
      Promise,
      Error,
      TypeError,
      RangeError,
      // Logger
      console: {
        log: (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      },
      // Injected bindings
      tools: toolsProxy,
      $codemode: codemodeHelper,
      // Standard libraries
      stdlib,
      collections: Collections,
      strings: Strings,
      math: MathUtils,
      json: JsonUtils,
      promises: PromiseUtils,
      date: DateUtils,
      url: UrlUtils,
      value: ValueUtils,
    };

    const vmContext = vm.createContext(sandbox);

    // 5. Wrap script in async function
    const wrappedCode = `(async () => {\n${code}\n})()`;

    try {
      const script = new vm.Script(wrappedCode, {
        filename: 'codemode_script.js',
      });

      // Run with timeout race
      const executionPromise = script.runInContext(vmContext, {
        timeout: timeoutMs,
        displayErrors: true,
      });

      const timeoutPromise = new Promise((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Execution timed out after ${timeoutMs}ms`));
        }, timeoutMs + 100);
        // Clean unref if available
        if (typeof (timer as any)?.unref === 'function') (timer as any).unref();
      });

      const rawResult = await Promise.race([executionPromise, timeoutPromise]);

      // Check output byte size if string or object
      let finalValue = rawResult;
      if (finalValue !== undefined) {
        const strVal = typeof finalValue === 'string' ? finalValue : JSON.stringify(finalValue);
        if (Buffer.byteLength(strVal, 'utf8') > maxOutputBytes) {
          finalValue = {
            warning: `Output exceeded ${maxOutputBytes} bytes and was truncated`,
            preview: strVal.slice(0, 1000) + '... [truncated]',
          };
        }
      }

      return {
        ok: true,
        value: finalValue,
        logs,
        toolCalls,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const message = err?.message || String(err);
      let kind: CodeModeDiagnostic['kind'] = 'ExecutionFailure';

      if (message.includes('timed out')) {
        kind = 'TimeoutExceeded';
      } else if (message.includes('Tool call limit exceeded')) {
        kind = 'ToolCallLimitExceeded';
      } else if (message.includes('is not registered in the CodeMode catalog')) {
        kind = 'UnknownTool';
      } else if (err instanceof SyntaxError) {
        kind = 'ParseError';
      }

      return {
        ok: false,
        error: { kind, message },
        logs,
        toolCalls,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
