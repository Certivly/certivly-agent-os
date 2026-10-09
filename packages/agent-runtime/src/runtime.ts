import { ConfigManager, AgentConfig } from '@agent-os/config';
import { SessionManager } from '@agent-os/sessions';
import * as fs from 'fs';
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
  searchSymbolsTool,
  codeInterpreterTool,
  McpClientManager,
} from '@agent-os/tools';
import { Provider, Model, OpenAIProvider, AnthropicProvider, LMStudioProvider, GeminiProvider, DeepSeekProvider, OllamaProvider, OpenRouterProvider } from '@agent-os/providers';
import { RuntimeError, ProviderError, logger, runWithContext, LoggingEventBus } from '@agent-os/shared';
import * as path from 'path';
import * as os from 'os';

import { AgentLoop } from './loop/AgentLoop';
import { WorkflowMemoryStore } from './memory/WorkflowMemoryStore';
import { LoopTool, AdaptedLoopTool } from './loop/LoopTool';
import { SessionHistory } from './loop/SessionHistory';
import type { RunSummary, PermissionMode, ApprovalRequest, ApprovalHandler } from './loop/types';

export type { ApprovalRequest, ApprovalHandler };

export interface RuntimeOptions {
  configPath?: string;
  configManager?: ConfigManager;
  workspaceRoot?: string;
  permissionMode?: PermissionMode;
  requestApproval?: ApprovalHandler;
}

export class AgentRuntime {
  private options: RuntimeOptions;
  private approvalHandler?: ApprovalHandler;
  private configManager: ConfigManager;
  private sessionManager: SessionManager;
  private toolRegistry: ToolRegistry;
  private activeProvider: Provider;
  private activeModel: Model;
  private eventBus: LoggingEventBus;
  private lastRunSummary?: RunSummary;
  private workflowMemoryStore: WorkflowMemoryStore;
  private mcpManager?: McpClientManager;

  constructor(options: RuntimeOptions, sessionId: string = 'default') {
    this.options = options;
    this.approvalHandler = options.requestApproval;
    const wsRoot = options.workspaceRoot || process.cwd();
    if (options.configManager) {
      this.configManager = options.configManager;
    } else if (options.configPath) {
      this.configManager = new ConfigManager({
        configPath: options.configPath,
        workspaceRoot: wsRoot,
        enableCascading: true,
      });
    } else {
      this.configManager = new ConfigManager({
        workspaceRoot: wsRoot,
        enableCascading: true,
      });
    }
    const config = this.configManager.load();

    const dbPath = path.resolve(process.cwd(), config.runtime.sessionDir, 'sessions.db');
    this.sessionManager = new SessionManager(dbPath);

    const resolvedWsRoot = options.workspaceRoot || config.repository?.rootPath || process.cwd();
    const memoryDbPath = path.resolve(resolvedWsRoot, '.agentos', 'workflow-memory.db');
    this.workflowMemoryStore = new WorkflowMemoryStore(memoryDbPath);

    this.toolRegistry = new ToolRegistry();
    this.activeProvider = this.initializeProvider(config);

    this.registerStandardTools();

    this.eventBus = new LoggingEventBus();
    this.activeModel = this.activeProvider.getModel(config.activeModel);

    // Initialize MCP Client Manager (loads both user ~/.agentos/mcp.json and workspace .agentos/mcp.json)
    this.mcpManager = new McpClientManager(resolvedWsRoot);
    const mcpWorkspaceConfig = path.join(resolvedWsRoot, '.agentos', 'mcp.json');
    const mcpGlobalConfig = path.join(os.homedir(), '.agentos', 'mcp.json');
    if (fs.existsSync(mcpWorkspaceConfig) || fs.existsSync(mcpGlobalConfig)) {
      this.mcpManager.loadFromWorkspaceConfig().then(() => {
        if (this.mcpManager) {
          this.toolRegistry.registerMcpManager(this.mcpManager);
        }
      }).catch((err: any) => {
        this.eventBus.publish('mcp.init.failed', { sessionId: 'system', error: err.message });
      });
    } else if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
      this.mcpManager.initializeFromConfig(this.options.configPath).then(() => {
        if (this.mcpManager) {
          this.toolRegistry.registerMcpManager(this.mcpManager);
        }
      }).catch((err: any) => {
        this.eventBus.publish('mcp.init.failed', { sessionId: 'system', error: err.message });
      });
    }

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
    this.toolRegistry.register(searchSymbolsTool);
    this.toolRegistry.register(codeInterpreterTool);
  }

  private initializeProvider(config: AgentConfig): Provider {
    return this.initializeProviderForName(config.activeProvider, config);
  }

  private initializeProviderForName(providerName: string, config: AgentConfig): Provider {
    switch (providerName) {
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
        return new OpenRouterProvider(
          config.providers['openrouter']?.apiKey ?? process.env.OPENROUTER_API_KEY ?? '',
          config.providers['openrouter']?.baseUrl
        );
      default: throw new RuntimeError(`Unsupported provider: ${providerName}`);
    }
  }

  public resolveModel(modelSpec?: string): Model | undefined {
    if (!modelSpec) return undefined;
    const config = this.configManager.load();
    if (modelSpec.includes('/')) {
      const [providerName, modelId] = modelSpec.split('/', 2);
      try {
        const provider = this.initializeProviderForName(providerName, config);
        return provider.getModel(modelId);
      } catch {
        return this.activeProvider.getModel(modelId);
      }
    }
    return this.activeProvider.getModel(modelSpec);
  }

  public setActiveModel(modelId: string): void {
    this.activeModel = this.activeProvider.getModel(modelId);
  }

  public getActiveModel(): Model {
    return this.activeModel;
  }

  public getSessionManager() { return this.sessionManager; }
  public getConfigManager() { return this.configManager; }
  public getToolRegistry() { return this.toolRegistry; }
  public getMcpManager() { return this.mcpManager; }
  
  public getEventBus(): LoggingEventBus {
    return this.eventBus;
  }

  public close(): void {
    this.sessionManager.close();
    this.workflowMemoryStore.close();
    this.mcpManager?.close().catch(() => {});
  }

  public getWorkflowMemoryStore(): WorkflowMemoryStore {
    return this.workflowMemoryStore;
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

      const config = this.configManager.load();
      const workspaceRoot = this.options.workspaceRoot || config.repository?.rootPath || process.cwd();
      const history = new SessionHistory(this.sessionManager);

      const permissionMode = this.options.permissionMode ?? config.permissionMode ?? 'manual';

      const agentConfig = config.agent ?? {};
      const fastModel = this.resolveModel(agentConfig.modelRoles?.fast) || this.activeModel;
      const planningModel = this.resolveModel(agentConfig.modelRoles?.planning) || this.activeModel;
      const reviewModel = this.resolveModel(agentConfig.modelRoles?.review) || this.activeModel;

      const loop = new AgentLoop({
        model: this.activeModel,
        tools: this.getLoopTools(workspaceRoot),
        toolRegistry: this.toolRegistry,
        history,
        eventBus,
        workspaceRoot,
        options: {
          maxTurns: agentConfig.maxTurns,
          maxWallTimeMs: agentConfig.maxWallTimeMs,
          maxApproxTokens: agentConfig.maxApproxTokens,
          maxVerificationFixAttempts: agentConfig.maxVerificationFixAttempts,
          selfReview: agentConfig.selfReview,
          parallelExploration: agentConfig.parallelExploration,
          planningMode: agentConfig.planningMode,
          permissionMode,
          hooks: config.hooks,
          workflowMemoryStore: this.workflowMemoryStore,
          fastModel,
          planningModel,
          reviewModel,
          antiLoopMonitoring: agentConfig.antiLoopMonitoring ?? true,
        },
        requestApproval: this.approvalHandler ?? this.options.requestApproval,
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

  public setRequestApprovalHandler(handler: ApprovalHandler): void {
    this.approvalHandler = handler;
  }

  public async resume(sessionId: string, runId?: string): Promise<RunSummary> {

    const config = this.configManager.load();
    const workspaceRoot = this.options.workspaceRoot || config.repository?.rootPath || process.cwd();
    const history = new SessionHistory(this.sessionManager);
    const permissionMode = this.options.permissionMode ?? config.permissionMode ?? 'manual';

    const agentConfig = config.agent ?? {};
    const fastModel = this.resolveModel(agentConfig.modelRoles?.fast) || this.activeModel;
    const planningModel = this.resolveModel(agentConfig.modelRoles?.planning) || this.activeModel;
    const reviewModel = this.resolveModel(agentConfig.modelRoles?.review) || this.activeModel;

    const loop = new AgentLoop({
      model: this.activeModel,
      tools: this.getLoopTools(workspaceRoot),
      toolRegistry: this.toolRegistry,
      history,
      eventBus: this.eventBus,
      workspaceRoot,
      options: {
        maxTurns: agentConfig.maxTurns,
        maxWallTimeMs: agentConfig.maxWallTimeMs,
        maxApproxTokens: agentConfig.maxApproxTokens,
        maxVerificationFixAttempts: agentConfig.maxVerificationFixAttempts,
        selfReview: agentConfig.selfReview,
        parallelExploration: agentConfig.parallelExploration,
        planningMode: agentConfig.planningMode,
        permissionMode,
        hooks: config.hooks,
        workflowMemoryStore: this.workflowMemoryStore,
        fastModel,
        planningModel,
        reviewModel,
        antiLoopMonitoring: agentConfig.antiLoopMonitoring ?? true,
      },
      requestApproval: this.approvalHandler ?? this.options.requestApproval,
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

