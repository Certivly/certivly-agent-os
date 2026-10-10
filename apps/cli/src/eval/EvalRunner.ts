import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, spawnSync } from 'child_process';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import {
  AgentLoop,
  SessionHistory,
  AdaptedLoopTool,
  RunTracer,
} from '@agent-os/agent-runtime';
import {
  readFileTool,
  editFileTool,
  writeFileTool,
  runCommandTool,
  listDirTool,
  grepTool,
  applyPatchTool,
  repoMapTool,
  commandPolicyEngine,
} from '@agent-os/tools';
import { FakeScriptedModel, ModelPricing, type Model, type GenerationRequest, type GenerationResponse } from '@agent-os/providers';
import type { EvalTask, EvalResult } from './EvalTypes';
import { EvalLoader } from './EvalLoader';
import { EvalReporter } from './EvalReporter';

export interface EvalRunOptions {
  model?: Model;
  modelName?: string;
  maxTurns?: number;
  timeoutMs?: number;
  outputJsonl?: string;
  outputMarkdown?: string;
  comparePath?: string;
  keepWorkspace?: boolean;
  onProgress?: (task: EvalTask, result: EvalResult) => void;
}

/**
 * Built-in scripted solver for evaluation benchmark verification.
 */
class ScriptedEvalModel implements Model {
  public id: string = 'fake:scripted';

  public async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const lastMsg = request.messages[request.messages.length - 1];
    const systemPrompt = request.systemPrompt || '';

    // If the last message was a tool result, produce final text
    if (lastMsg && lastMsg.role === 'tool') {
      return {
        text: 'The required task has been successfully solved and verified.',
      };
    }

    // Determine task by reading instructions or prompt context in messages
    const allContent = request.messages.map((m) => m.content).join('\n');

    if (allContent.includes('array-slice.ts') || allContent.includes('off-by-one')) {
      return {
        text: 'Fixing off-by-one error in src/array-slice.ts',
        toolCalls: [
          {
            id: 'call-fix-off-by-one',
            name: 'edit_file',
            args: JSON.stringify({
              path: 'src/array-slice.ts',
              oldText: 'for (let i = 0; i <= length; i++)',
              newText: 'for (let i = 0; i < length; i++)',
            }),
          },
        ],
      };
    }

    if (allContent.includes('user.ts') || allContent.includes('null handling')) {
      return {
        text: 'Fixing null handling error in src/user.ts',
        toolCalls: [
          {
            id: 'call-fix-null',
            name: 'write_file',
            args: JSON.stringify({
              path: 'src/user.ts',
              content:
                'export interface User {\n  id: string;\n  profile?: { name?: string };\n}\n\nexport function getDisplayName(user?: User | null): string {\n  return user?.profile?.name || "Anonymous";\n}\n',
              overwrite: true,
            }),
          },
        ],
      };
    }

    if (allContent.includes('compare.ts') || allContent.includes('max(')) {
      return {
        text: 'Fixing max comparison in src/compare.ts',
        toolCalls: [
          {
            id: 'call-fix-compare',
            name: 'edit_file',
            args: JSON.stringify({
              path: 'src/compare.ts',
              oldText: 'return a < b ? a : b;',
              newText: 'return a > b ? a : b;',
            }),
          },
        ],
      };
    }

    if (allContent.includes('string-utils.ts') || allContent.includes('capitalize(')) {
      return {
        text: 'Implementing capitalize in src/string-utils.ts',
        toolCalls: [
          {
            id: 'call-add-capitalize',
            name: 'write_file',
            args: JSON.stringify({
              path: 'src/string-utils.ts',
              content:
                'export function capitalize(str: string): string {\n  if (!str) return str;\n  return str.charAt(0).toUpperCase() + str.slice(1);\n}\n',
              overwrite: true,
            }),
          },
        ],
      };
    }

    if (allContent.includes('validator.py') || allContent.includes('isValidHexColor')) {
      return {
        text: 'Fixing regex in validator.py',
        toolCalls: [
          {
            id: 'call-fix-regex',
            name: 'write_file',
            args: JSON.stringify({
              path: 'validator.py',
              content:
                'import re\n\ndef isValidHexColor(color: str) -> bool:\n    if not color:\n        return False\n    return bool(re.match(r"^#(?:[0-9a-fA-F]{3}){1,2}$", color))\n',
              overwrite: true,
            }),
          },
        ],
      };
    }

    if (allContent.includes('verifyToken') || allContent.includes('repo-map-query-rank')) {
      return {
        text: 'Updating auth.ts with verifyToken implementation',
        toolCalls: [
          {
            id: 'call-auth-fix',
            name: 'write_file',
            args: JSON.stringify({
              path: 'src/auth.ts',
              content:
                'export function verifyToken(token: string): boolean {\n  return token === "secret-token";\n}\n',
              overwrite: true,
            }),
          },
        ],
      };
    }

    if (allContent.includes('calculateDiscount') || allContent.includes('repo-map-symbol-lookup')) {
      return {
        text: 'Updating pricing.ts with calculateDiscount implementation',
        toolCalls: [
          {
            id: 'call-pricing-fix',
            name: 'write_file',
            args: JSON.stringify({
              path: 'src/pricing.ts',
              content:
                'export function calculateDiscount(price: number): number {\n  return price * 0.8;\n}\n',
              overwrite: true,
            }),
          },
        ],
      };
    }

    if (allContent.includes('parseCsvLine') || allContent.includes('repo-map-stack-trace') || allContent.includes('parser.ts')) {
      return {
        text: 'Fixing null handling in parser.ts',
        toolCalls: [
          {
            id: 'call-parser-fix',
            name: 'write_file',
            args: JSON.stringify({
              path: 'src/parser.ts',
              content:
                'export function parseCsvLine(line?: string | null): string[] {\n  if (!line) return [];\n  return line.split(",").map((s) => s.trim());\n}\n',
              overwrite: true,
            }),
          },
        ],
      };
    }

    // Generic fallback for any other task: emit final response
    return {
      text: 'Task processed.',
    };
  }
}

export class EvalRunner {
  public static async executeVerifier(
    verifierPath: string,
    cwd: string,
    type: string,
    timeoutMs: number = 60_000
  ): Promise<{ exitCode: number; output: string }> {
    let command: string;
    if (type === 'sh' || verifierPath.endsWith('.sh')) {
      command = `sh "${verifierPath}"`;
    } else {
      command = `bun "${verifierPath}"`;
    }

    return new Promise((resolve) => {
      let output = '';
      let settled = false;
      const child = spawn(command, {
        shell: true,
        cwd,
        env: process.env,
        windowsHide: true,
      });

      const killProc = () => {
        if (!child || child.killed) return;
        try {
          if (process.platform === 'win32' && child.pid) {
            spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
          } else if (child.pid) {
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch (_e) {
              child.kill('SIGKILL');
            }
          }
        } catch (_treeErr) {
          try {
            child.kill('SIGKILL');
          } catch (_killErr) {
            // Process may have already terminated
          }
        }
      };

      const finish = (result: { exitCode: number; output: string }) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      };

      const timer = timeoutMs > 0 ? setTimeout(() => {
        killProc();
        finish({
          exitCode: 124,
          output: (output + `\n[Verifier timed out after ${timeoutMs}ms]`).trim(),
        });
      }, timeoutMs) : null;

      child.stdout?.on('data', (d) => {
        output += d.toString();
      });

      child.stderr?.on('data', (d) => {
        output += d.toString();
      });

      child.on('error', (err) => {
        output += `\n${err.message}`;
        finish({ exitCode: 1, output: output.trim() });
      });

      child.on('close', (code) => {
        finish({ exitCode: code ?? 1, output: output.trim() });
      });
    });
  }

  public static resolveModel(options: EvalRunOptions, taskId?: string): Model {
    if (options.model) {
      return options.model;
    }
    const modelName = options.modelName || 'fake:scripted';
    if (modelName.startsWith('fake') || modelName === 'scripted') {
      return new FakeScriptedModel({ taskId });
    }

    const parts = modelName.split(':');
    const provider = parts[0];
    const modelId = parts.slice(1).join(':') || undefined;

    if (provider === 'gemini') {
      const { GeminiProvider } = require('@agent-os/providers');
      const prov = new GeminiProvider(process.env.GEMINI_API_KEY || '');
      return prov.getModel(modelId || 'gemini-2.0-flash');
    }
    if (provider === 'deepseek') {
      const { DeepSeekProvider } = require('@agent-os/providers');
      const prov = new DeepSeekProvider(process.env.DEEPSEEK_API_KEY || '');
      return prov.getModel(modelId || 'deepseek-chat');
    }
    if (provider === 'openai') {
      const { OpenAIProvider } = require('@agent-os/providers');
      const prov = new OpenAIProvider(process.env.OPENAI_API_KEY || '');
      return prov.getModel(modelId || 'gpt-4o');
    }
    if (provider === 'anthropic') {
      const { AnthropicProvider } = require('@agent-os/providers');
      const prov = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');
      return prov.getModel(modelId || 'claude-3-5-sonnet-20241022');
    }
    if (provider === 'openrouter') {
      const { OpenRouterProvider } = require('@agent-os/providers');
      const prov = new OpenRouterProvider(process.env.OPENROUTER_API_KEY || '');
      return prov.getModel(modelId || 'anthropic/claude-3.5-sonnet');
    }
    if (provider === 'ollama') {
      const { OllamaProvider } = require('@agent-os/providers');
      const prov = new OllamaProvider(process.env.OLLAMA_API_KEY || '', process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
      return prov.getModel(modelId || 'qwen2.5-coder:7b');
    }
    if (provider === 'lmstudio') {
      const { LMStudioProvider } = require('@agent-os/providers');
      const prov = new LMStudioProvider(process.env.LMSTUDIO_API_KEY || '', process.env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234/v1');
      return prov.getModel(modelId || 'qwen2.5-coder-7b');
    }

    if (modelName.startsWith('http://') || modelName.startsWith('https://')) {
      const lastSlash = modelName.lastIndexOf('/');
      const baseUrl = lastSlash > 8 ? modelName.substring(0, lastSlash) : modelName;
      const id = lastSlash > 8 ? modelName.substring(lastSlash + 1) : 'default';
      const { OpenAIProvider } = require('@agent-os/providers');
      const prov = new OpenAIProvider(undefined, baseUrl, undefined, 'custom-url');
      return prov.getModel(id);
    }

    // Fallback to FakeScriptedModel for eval harness
    return new FakeScriptedModel({ taskId });
  }

  public static async runTask(
    task: EvalTask,
    options: EvalRunOptions = {}
  ): Promise<EvalResult> {
    const modelName = options.modelName || (options.model as any)?.id || 'fake:scripted';
    const provider = modelName.split(':')[0];
    const envKeyMap: Record<string, string> = {
      gemini: 'GEMINI_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
    };
    const requiredKey = envKeyMap[provider];
    if (requiredKey && !process.env[requiredKey]) {
      return {
        taskId: task.id,
        passed: false,
        skipped: true,
        skipReason: `${requiredKey} not set`,
        turns: 0,
        toolCalls: {},
        tokens: { input: 0, output: 0 },
        wallTimeMs: 0,
        filesChanged: [],
        errors: [`Skipped: ${requiredKey} not set`],
        providerName: provider,
        modelName,
      };
    }

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `eval-${task.id}-${crypto.randomUUID().slice(0, 8)}-`)
    );
    const dbPath = path.join(tempDir, `session-${crypto.randomUUID()}.db`);
    const startTime = Date.now();

    try {
      // 1. Copy fixture repo to temp dir (verifier is excluded)
      await EvalLoader.prepareWorkspace(task, tempDir);

      // Verify that verifier is NOT in workspace during agent run
      const verifierName = path.basename(task.verifierPath);
      if (fs.existsSync(path.join(tempDir, verifierName))) {
        fs.unlinkSync(path.join(tempDir, verifierName));
      }

      // 2. Set up AgentLoop and tools
      commandPolicyEngine.setMode('workspace-write');
      const sm = new SessionManager(dbPath);
      const history = new SessionHistory(sm);
      const eventBus = new LoggingEventBus();
      const tracer = new RunTracer({
        sessionId: `eval-${task.id}`,
        workspaceRoot: process.cwd(),
      });
      tracer.attachToEventBus(eventBus);

      const model = this.resolveModel(options, task.id);

      const tools = [
        new AdaptedLoopTool(readFileTool, { workspaceRoot: tempDir }),
        new AdaptedLoopTool(editFileTool, { workspaceRoot: tempDir }),
        new AdaptedLoopTool(writeFileTool, { workspaceRoot: tempDir }),
        new AdaptedLoopTool(runCommandTool, { workspaceRoot: tempDir }),
        new AdaptedLoopTool(listDirTool, { workspaceRoot: tempDir }),
        new AdaptedLoopTool(grepTool, { workspaceRoot: tempDir }),
        new AdaptedLoopTool(applyPatchTool, { workspaceRoot: tempDir }),
        new AdaptedLoopTool(repoMapTool, { workspaceRoot: tempDir }),
      ];

      const loop = new AgentLoop({
        model,
        tools,
        history,
        eventBus,
        workspaceRoot: tempDir,
        requestApproval: async () => ({ approved: true }),
        options: {
          maxTurns: options.maxTurns ?? 10,
          maxWallTimeMs: options.timeoutMs ?? 120000,
          skipVerification: true, // We run the authoritative verifier after agent finishes
          noReadGuard: true,
        },
      });

      // 3. Run agent headless with prompt
      const summary = await loop.run({
        sessionId: `eval-${task.id}`,
        userInput: task.promptContent,
        workspaceRoot: tempDir,
      });

      tracer.stop();

      // 4. Copy verifier to temp dir after agent run
      const copiedVerifierPath = await EvalLoader.copyVerifier(task, tempDir);

      // 5. Run verifier
      const verifierRes = await this.executeVerifier(
        copiedVerifierPath,
        tempDir,
        task.verifierType
      );

      const wallTimeMs = Date.now() - startTime;
      let passed = verifierRes.exitCode === 0;
      let failureReason: string | undefined;

      if (summary.verificationPassed === false) {
        passed = false;
        failureReason = `Verification failed: ${summary.verificationOutput}`;
      }

      // Group tool calls count
      const toolCallsMap: Record<string, number> = {};
      for (const tc of summary.toolCalls) {
        toolCallsMap[tc.name] = (toolCallsMap[tc.name] || 0) + 1;
      }

      const modelName = options.modelName || 'fake:scripted';
      const pricing = ModelPricing.loadFromFile(
        path.resolve(process.cwd(), 'evals', 'model-prices.json')
      );
      const estimatedCostUsd = pricing.calculateCost(
        modelName,
        summary.approxInputTokens,
        summary.approxOutputTokens
      );

      const result: EvalResult = {
        taskId: task.id,
        passed,
        failureReason,
        turns: summary.turns,
        toolCalls: toolCallsMap,
        tokens: {
          input: summary.approxInputTokens,
          output: summary.approxOutputTokens,
        },
        wallTimeMs,
        filesChanged: summary.filesChanged,
        errors: summary.errors,
        verifierOutput: verifierRes.output,
        modelName,
        providerName: modelName.includes(':') ? modelName.split(':')[0] : 'unknown',
        estimatedCostUsd,
        tracePath: tracer.traceFilePath,
      };

      return result;
    } finally {
      if (!options.keepWorkspace) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_err) {
          // best-effort: temporary eval workspace cleanup
        }
      }
    }
  }

  public static async runAll(
    tasks: EvalTask[],
    options: EvalRunOptions = {}
  ): Promise<EvalResult[]> {
    const results: EvalResult[] = [];
    for (const task of tasks) {
      const res = await this.runTask(task, options);
      results.push(res);
      if (options.onProgress) {
        options.onProgress(task, res);
      }
      if (options.outputJsonl) {
        EvalReporter.appendJsonl(options.outputJsonl, res);
      }
    }

    if (options.outputMarkdown) {
      let baseline: EvalResult[] | undefined;
      if (options.comparePath && fs.existsSync(options.comparePath)) {
        baseline = EvalReporter.readJsonl(options.comparePath);
      }
      const md = EvalReporter.toMarkdownTable(results, baseline);
      fs.writeFileSync(options.outputMarkdown, md, 'utf8');
    }

    return results;
  }
}
