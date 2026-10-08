import { ConfigManager, AgentConfig } from '@agent-os/config';
import { SessionManager } from '@agent-os/sessions';
import {
  ToolRegistry,
  readFileTool,
  writeFileTool,
  editFileTool,
  applyPatchTool,
  grepTool,
  listDirTool,
  runCommandTool,
  listFilesTool,
  searchFilesTool,
  repoMapTool,
} from '@agent-os/tools';
import { Provider, Model, OpenAIProvider, AnthropicProvider, LMStudioProvider, GeminiProvider, DeepSeekProvider, OllamaProvider } from '@agent-os/providers';
import { RuntimeError, ProviderError, logger, runWithContext, LoggingEventBus } from '@agent-os/shared';
import * as path from 'path';

import { AgentLoop } from './loop/AgentLoop';
import { LoopTool, AdaptedLoopTool } from './loop/LoopTool';
import { SessionHistory } from './loop/SessionHistory';
import type { RunSummary, PermissionMode } from './loop/types';

export interface RuntimeOptions {
  configPath: string;
  permissionMode?: PermissionMode;
}

export class AgentRuntime {
  private options: RuntimeOptions;
  private configManager: ConfigManager;
  private sessionManager: SessionManager;
  private toolRegistry: ToolRegistry;
  private activeProvider: Provider;
  private activeModel: Model;
  private eventBus: LoggingEventBus;
  private lastRunSummary?: RunSummary;

  constructor(options: RuntimeOptions, sessionId: string = 'default') {
    this.options = options;
    this.configManager = new ConfigManager(options.configPath);
    const config = this.configManager.load();

    const dbPath = path.join(process.cwd(), config.runtime.sessionDir, 'sessions.db');
    this.sessionManager = new SessionManager(dbPath);

    this.toolRegistry = new ToolRegistry();
    this.activeProvider = this.initializeProvider(config);

    this.registerStandardTools();

    this.eventBus = new LoggingEventBus();
    this.activeModel = this.activeProvider.getModel(config.activeModel);

    // Check provider health at startup and publish event
    if (typeof this.activeProvider.checkHealth === 'function') {
      this.activeProvider.checkHealth().then(health => {
        if (!health.ok) {
          this.eventBus.publish('provider.health.failed', { sessionId: 'system', error: health.error });
        } else {
          this.eventBus.publish('provider.health.ok', { sessionId: 'system' });
        }
      }).catch(() => {});
    }
  }

  private registerStandardTools() {
    this.toolRegistry.register(readFileTool);
    this.toolRegistry.register(grepTool);
    this.toolRegistry.register(listDirTool);
    this.toolRegistry.register(editFileTool);
    this.toolRegistry.register(writeFileTool);
    this.toolRegistry.register(applyPatchTool);
    this.toolRegistry.register(runCommandTool);
    this.toolRegistry.register(repoMapTool);
  }

  private initializeProvider(config: AgentConfig): Provider {
    switch (config.activeProvider) {
      case 'openai': return new OpenAIProvider(config.providers['openai']?.apiKey, config.providers['openai']?.baseUrl);
      case 'lmstudio': return new LMStudioProvider(config.providers['lmstudio']?.apiKey, config.providers['lmstudio']?.baseUrl);
      case 'anthropic': return new AnthropicProvider(config.providers['anthropic']?.apiKey);
      case 'gemini':
        return new GeminiProvider(
          config.providers['gemini']?.apiKey ?? process.env.GEMINI_API_KEY ?? '',
          config.providers['gemini']?.baseUrl
        );
      case 'deepseek':
        return new DeepSeekProvider(
          config.providers['deepseek']?.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '',
          config.providers['deepseek']?.baseUrl
        );
      case 'ollama':
        return new OllamaProvider(
          config.providers['ollama']?.apiKey ?? '',
          config.providers['ollama']?.baseUrl ?? 'http://127.0.0.1:11434'
        );
      case 'openrouter':
        throw new RuntimeError(`${config.activeProvider} provider is not implemented yet`);
      default: throw new RuntimeError(`Unsupported provider: ${config.activeProvider}`);
    }
  }

  public getSessionManager() { return this.sessionManager; }
  public getConfigManager() { return this.configManager; }
  public getToolRegistry() { return this.toolRegistry; }
  
  public getEventBus(): LoggingEventBus {
    return this.eventBus;
  }

  public getLastRunSummary(): RunSummary | undefined {
    return this.lastRunSummary;
  }

  public getLoopTools(workspaceRoot: string = process.cwd()): LoopTool[] {
    const tools: LoopTool[] = [];

    for (const tool of this.toolRegistry.list()) {
      tools.push(
        new AdaptedLoopTool(tool, {
          workspaceRoot,
        })
      );
    }

    return tools;
  }

  public async handleRequest(sessionId: string, input: string, stream = false): Promise<AsyncIterable<string> | string> {
    const requestId = crypto.randomUUID();
    
    return runWithContext({ requestId, sessionId }, async () => {
      logger.info('runtime', 'message.received', `Handling request via AgentLoop for session ${sessionId}`);
      const eventBus = this.getEventBus();
      eventBus.publish('message.received', { sessionId, input });

      if (!this.activeProvider || !this.activeModel) {
        throw new RuntimeError('No active provider or model configured');
      }

      try {
        this.sessionManager.getSession(sessionId);
      } catch {
        this.sessionManager.createSession(sessionId);
        eventBus.publish('session.created', { sessionId });
      }

      // Check provider health if checkHealth method is present
      const health = typeof this.activeProvider.checkHealth === 'function' ? await this.activeProvider.checkHealth() : { ok: true };
      if (!health.ok) {
        const errMsg = `Provider connection failed: ${health.error}`;
        eventBus.publish('message.responded', { sessionId, response: errMsg });
        return errMsg;
      }

      const config = this.configManager.load();
      const workspaceRoot = config.repository?.rootPath || process.cwd();
      const history = new SessionHistory(this.sessionManager);

      const permissionMode = this.options.permissionMode ?? config.permissionMode ?? 'manual';

      const loop = new AgentLoop({
        model: this.activeModel,
        tools: this.getLoopTools(workspaceRoot),
        toolRegistry: this.toolRegistry,
        history,
        eventBus,
        workspaceRoot,
        options: {
          permissionMode,
          hooks: config.hooks,
        },
      });

      const summary = await loop.run({
        sessionId,
        userInput: input,
        workspaceRoot,
      });

      this.lastRunSummary = summary;

      if (!summary.success) {
        const errorText = summary.errors.join('; ') || 'Execution failed';
        if (summary.errors.some(e => /provider/i.test(e) || /timeout/i.test(e))) {
          throw new ProviderError(errorText);
        }
        const errorResponse = summary.finalText
          ? `${summary.finalText}\n\n[Error: ${errorText}]`
          : `Error: ${errorText}`;
        eventBus.publish('message.responded', { sessionId, response: errorResponse });
        return errorResponse;
      }

      const response = summary.finalText;
      eventBus.publish('message.responded', { sessionId, response });
      
      return response;
    });
  }

  public async resume(sessionId: string, runId?: string): Promise<RunSummary> {

    const config = this.configManager.load();
    const workspaceRoot = config.repository?.rootPath || process.cwd();
    const history = new SessionHistory(this.sessionManager);
    const permissionMode = this.options.permissionMode ?? config.permissionMode ?? 'manual';

    const loop = new AgentLoop({
      model: this.activeModel,
      tools: this.getLoopTools(workspaceRoot),
      toolRegistry: this.toolRegistry,
      history,
      eventBus: this.eventBus,
      workspaceRoot,
      options: {
        permissionMode,
        hooks: config.hooks,
      },
    });

    const summary = await loop.resume({
      sessionId,
      runId,
      workspaceRoot,
    });

    this.lastRunSummary = summary;
    return summary;
  }
}

