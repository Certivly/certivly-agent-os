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
  todoWriteTool,
  loadSkillTool,
  delegateSubagentTool,
  terminalInteractiveTool,
  readUrlTool,
  webSearchTool,
  readDocsTool,
  setSubagentDelegateHandler,
  McpClientManager,
} from '@agent-os/tools';
import { ToolCatalog, CodeModeTool } from '@agent-os/codemode';
import { Provider, Model, OpenAIProvider, AnthropicProvider, LMStudioProvider, GeminiProvider, DeepSeekProvider, OllamaProvider, OpenRouterProvider } from '@agent-os/providers';
import { RuntimeError, ProviderError, logger, runWithContext, LoggingEventBus } from '@agent-os/shared';
import * as path from 'path';
import * as os from 'os';

import { AgentLoop } from './loop/AgentLoop';
import { WorkflowMemoryStore } from './memory/WorkflowMemoryStore';
import { SkillRegistry } from './skills/SkillRegistry';
import { SubagentRegistry, SubagentRunner, AgentTeamCoordinator } from './multiagent';
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
  private skillRegistry: SkillRegistry;
  private subagentRegistry: SubagentRegistry;
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
    this.skillRegistry = new SkillRegistry({ workspaceRoot: resolvedWsRoot });
    this.subagentRegistry = new SubagentRegistry({ workspaceRoot: resolvedWsRoot });

    this.toolRegistry = new ToolRegistry();
    this.activeProvider = this.initializeProvider(config);

    this.registerStandardTools();

    this.eventBus = new LoggingEventBus();
    const resolvedModel = this.resolveModel(config.activeModel);
    if (resolvedModel) {
      this.activeModel = resolvedModel;
      if (config.activeModel.includes('/')) {
        const [pName] = config.activeModel.split('/', 2);
        try {
          this.activeProvider = this.initializeProviderForName(pName, config);
        } catch (_err: unknown) {
          // Keep default initialized provider if fallback was used
        }
      }
    } else {
      this.activeModel = this.activeProvider.getModel(config.activeModel);
    }

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
    this.toolRegistry.register(todoWriteTool);
    this.toolRegistry.register(loadSkillTool);
    this.toolRegistry.register(delegateSubagentTool);
    this.toolRegistry.register(terminalInteractiveTool);
    this.toolRegistry.register(readUrlTool);
    this.toolRegistry.register(webSearchTool);
    this.toolRegistry.register(readDocsTool);
    const codeModeCatalog = new ToolCatalog(this.toolRegistry);
    this.toolRegistry.register(new CodeModeTool(codeModeCatalog));

    // Bind autonomous subagent delegation handler
    setSubagentDelegateHandler(async (agentName, task, context, toolContext) => {
      const def = this.subagentRegistry.getSubagent(agentName);
      if (!def) {
        const available = this.subagentRegistry.listSubagents().map(a => a.name).join(', ');
        return {
          content: `Error: Subagent "${agentName}" not found. Available subagents: ${available}`,
          isError: true,
        };
      }
      if (agentName === 'browser_verifier') {
        const urlMatch = (task + ' ' + (context || '')).match(/https?:\/\/[^\s"'`]+/);
        if (urlMatch) {
          const { BrowserVerifierSubagent } = await import('./verification/BrowserVerifierSubagent');
          const verifier = new BrowserVerifierSubagent(this.activeModel);
          const result = await verifier.verify({ targetUrl: urlMatch[0], instructions: task });
          const errorsText = result.consoleErrors.map(e => `  - [${e.type}] ${e.text}`).join('\n') || 'None';
          const networkText = result.failedNetworkRequests.map(r => `  - ${r.status} ${r.url}`).join('\n') || 'None';
          return {
            content: `[Browser Verification: ${urlMatch[0]}]\nStatus: ${result.status.toUpperCase()}\nSummary: ${result.summary}\nConsole Errors:\n${errorsText}\nFailed Requests:\n${networkText}`,
            isError: result.status === 'failed',
          };
        }
      }

      const runner = new SubagentRunner(
        this.activeModel,
        this.toolRegistry,
        this.eventBus,
        {
          workspaceRoot: toolContext?.workspaceRoot || this.options.workspaceRoot || process.cwd(),
          fastModel: this.resolveModel(this.configManager.load().agent?.modelRoles?.fast),
          reviewModel: this.resolveModel(this.configManager.load().agent?.modelRoles?.review),
        }
      );
      const res = await runner.runSubagent(def, task, {
        workspaceRoot: toolContext?.workspaceRoot,
        initialContext: context ? { context } : undefined,
      });
      return {
        content: `[Subagent Result: ${res.agentName.toUpperCase()}] (${res.turnsUsed} turns, ${res.toolsExecuted.length} tools executed)\nStatus: ${res.success ? 'SUCCESS' : 'FAILED'}\n\n${res.finalText}`,
        isError: !res.success,
      };
    });
  }

  public createCodeModeTool(): CodeModeTool {
    const catalog = new ToolCatalog(this.toolRegistry);
    return new CodeModeTool(catalog);
  }

  private initializeProvider(config: AgentConfig): Provider {
    return this.initializeProviderForName(config.activeProvider, config);
  }

  private initializeProviderForName(providerName: string, config: AgentConfig): Provider {
    // 1. Check if provider is configured in user/project config.providers
    const provConfig = config.providers[providerName];
    if (provConfig) {
      const type = (provConfig.type || '').toLowerCase();
      const baseUrl = provConfig.baseUrl;
      const apiKey = provConfig.apiKey;
      const headers = provConfig.headers;

      // Anthropic or Claude compatible
      if (type === 'anthropic' || (!type && (baseUrl?.includes('anthropic') || provConfig.model?.startsWith('claude')))) {
        return new AnthropicProvider(apiKey, baseUrl, headers, providerName);
      }

      // Gemini
      if (type === 'gemini') {
        return new GeminiProvider(apiKey ?? process.env.GEMINI_API_KEY ?? '', baseUrl);
      }

      // DeepSeek
      if (type === 'deepseek') {
        return new DeepSeekProvider(apiKey ?? process.env.DEEPSEEK_API_KEY ?? '', baseUrl);
      }

      // Ollama
      if (type === 'ollama') {
        return new OllamaProvider(apiKey ?? '', baseUrl ?? 'http://127.0.0.1:11434');
      }

      // OpenRouter
      if (type === 'openrouter') {
        return new OpenRouterProvider(apiKey ?? process.env.OPENROUTER_API_KEY ?? '', baseUrl);
      }

      // LM Studio
      if (type === 'lmstudio') {
        return new LMStudioProvider(apiKey, baseUrl);
      }

      // Default: Any OpenAI-compatible provider (vLLM, Groq, Together, Mistral, Perplexity, LiteLLM, custom proxy, etc.)
      return new OpenAIProvider(apiKey, baseUrl, headers, providerName);
    }

    // 2. Built-in standard providers
    switch (providerName) {
      case 'openai':
        return new OpenAIProvider(config.providers['openai']?.apiKey, config.providers['openai']?.baseUrl, config.providers['openai']?.headers, 'openai');
      case 'anthropic':
        return new AnthropicProvider(config.providers['anthropic']?.apiKey, config.providers['anthropic']?.baseUrl, config.providers['anthropic']?.headers, 'anthropic');
      case 'lmstudio':
        return new LMStudioProvider(config.providers['lmstudio']?.apiKey, config.providers['lmstudio']?.baseUrl);
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
      default:
        // 3. Fallback: If provider name is an HTTP/HTTPS URL, treat as OpenAI-compatible endpoint
        if (providerName.startsWith('http://') || providerName.startsWith('https://')) {
          return new OpenAIProvider(undefined, providerName, undefined, 'custom-url');
        }
        throw new RuntimeError(`Unsupported provider: ${providerName}. To use custom providers, configure them in agentos.json under "providers" with baseUrl and type ('openai' or 'anthropic').`);
    }
  }

  public resolveModel(modelSpec?: string): Model | undefined {
    if (!modelSpec) return undefined;
    const config = this.configManager.load();

    if (modelSpec.startsWith('http://') || modelSpec.startsWith('https://')) {
      const lastSlash = modelSpec.lastIndexOf('/');
      if (lastSlash > 8) {
        const baseUrl = modelSpec.substring(0, lastSlash);
        const modelId = modelSpec.substring(lastSlash + 1);
        const provider = new OpenAIProvider(undefined, baseUrl, undefined, 'custom-url');
        return provider.getModel(modelId);
      }
    }

    if (modelSpec.includes('/')) {
      const [providerName, modelId] = modelSpec.split('/', 2);
      try {
        const provider = this.initializeProviderForName(providerName, config);
        return provider.getModel(modelId);
      } catch (_err: unknown) {
        return this.activeProvider.getModel(modelId);
      }
    }
    return this.activeProvider.getModel(modelSpec);
  }

  public setActiveModel(modelId: string): void {
    if (modelId.startsWith('http://') || modelId.startsWith('https://')) {
      const resolved = this.resolveModel(modelId);
      if (resolved) {
        this.activeModel = resolved;
        const lastSlash = modelId.lastIndexOf('/');
        const baseUrl = modelId.substring(0, lastSlash);
        this.activeProvider = new OpenAIProvider(undefined, baseUrl, undefined, 'custom-url');
        return;
      }
    }

    if (modelId.includes('/')) {
      const resolved = this.resolveModel(modelId);
      if (resolved) {
        this.activeModel = resolved;
        const [providerName] = modelId.split('/', 2);
        try {
          const config = this.configManager.load();
          this.activeProvider = this.initializeProviderForName(providerName, config);
        } catch (_err: unknown) {
          // Keep activeProvider
        }
        return;
      }
    }
    this.activeModel = this.activeProvider.getModel(modelId);
  }

  public setActiveProvider(providerName: string): void {
    const config = this.configManager.load();
    this.activeProvider = this.initializeProviderForName(providerName, config);
    this.activeModel = this.activeProvider.getModel(config.activeModel);
  }

  public getActiveModel(): Model {
    return this.activeModel;
  }

  public getModel(): Model {
    return this.activeModel;
  }

  public getActiveProvider(): Provider {
    return this.activeProvider;
  }

  public getProvider(): Provider {
    return this.activeProvider;
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

  public getSkillRegistry(): SkillRegistry {
    return this.skillRegistry;
  }

  public getSubagentRegistry(): SubagentRegistry {
    return this.subagentRegistry;
  }

  public getTeamCoordinator(): AgentTeamCoordinator {
    const runner = new SubagentRunner(
      this.activeModel,
      this.toolRegistry,
      this.eventBus,
      {
        workspaceRoot: this.options.workspaceRoot || process.cwd(),
        fastModel: this.resolveModel(this.configManager.load().agent?.modelRoles?.fast),
        reviewModel: this.resolveModel(this.configManager.load().agent?.modelRoles?.review),
      }
    );
    return new AgentTeamCoordinator(this.subagentRegistry, runner, this.eventBus);
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
      } catch (_err: unknown) {
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

