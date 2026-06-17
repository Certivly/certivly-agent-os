import { ConfigManager, AgentConfig } from '@agent-os/config';
import { SessionManager } from '@agent-os/sessions';
import { ToolRegistry, readFileTool, writeFileTool, listFilesTool, searchFilesTool, runCommandTool } from '@agent-os/tools';
import { Provider, OpenAIProvider, AnthropicProvider, GeminiProvider, DeepSeekProvider, OpenRouterProvider, OllamaProvider } from '@agent-os/providers';
import { RuntimeError, logger, runWithContext, agentContext, LoggingEventBus } from '@agent-os/shared';
import * as path from 'path';
import { PipelineContext } from './pipeline';
import { DefaultContextBuilder, DefaultPlanner, DefaultProviderExecutor, DefaultToolExecutor, DefaultObservationHandler, DefaultResponseBuilder } from './pipeline-stages';

export interface RuntimeOptions {
  configPath: string;
}

export class AgentRuntime {
  private configManager: ConfigManager;
  private sessionManager: SessionManager;
  private toolRegistry: ToolRegistry;
  private activeProvider: Provider;
  
  private eventBus: LoggingEventBus;
  private contextBuilder: DefaultContextBuilder;
  private planner: DefaultPlanner;
  private providerExecutor: DefaultProviderExecutor;
  private toolExecutor: DefaultToolExecutor;
  private observationHandler: DefaultObservationHandler;
  private responseBuilder: DefaultResponseBuilder;

  constructor(options: RuntimeOptions) {
    this.configManager = new ConfigManager(options.configPath);
    const config = this.configManager.load();

    const dbPath = path.join(process.cwd(), config.runtime.sessionDir, 'sessions.db');
    this.sessionManager = new SessionManager(dbPath);

    this.toolRegistry = new ToolRegistry();
    this.registerStandardTools();

    this.activeProvider = this.initializeProvider(config);

    this.eventBus = new LoggingEventBus();
    this.contextBuilder = new DefaultContextBuilder(this.sessionManager);
    this.planner = new DefaultPlanner();
    this.providerExecutor = new DefaultProviderExecutor();
    this.toolExecutor = new DefaultToolExecutor(this.sessionManager);
    this.observationHandler = new DefaultObservationHandler();
    this.responseBuilder = new DefaultResponseBuilder(this.sessionManager);
  }

  private registerStandardTools() {
    this.toolRegistry.register(readFileTool);
    this.toolRegistry.register(writeFileTool);
    this.toolRegistry.register(listFilesTool);
    this.toolRegistry.register(searchFilesTool);
    this.toolRegistry.register(runCommandTool);
  }

  private initializeProvider(config: AgentConfig): Provider {
    switch (config.activeProvider) {
      case 'openai':
        return new OpenAIProvider(config.providers['openai']?.apiKey, config.providers['openai']?.baseUrl);
      case 'lmstudio':
        return new OpenAIProvider(
          config.providers['lmstudio']?.apiKey || 'lm-studio',
          config.providers['lmstudio']?.baseUrl || 'http://localhost:1234/v1'
        );
      case 'anthropic':
        return AnthropicProvider;
      case 'gemini':
        return GeminiProvider;
      case 'deepseek':
        return DeepSeekProvider;
      case 'openrouter':
        return OpenRouterProvider;
      case 'ollama':
        return OllamaProvider;
      default:
        throw new RuntimeError(`Unsupported provider: ${config.activeProvider}`);
    }
  }

  public getSessionManager() { return this.sessionManager; }
  public getConfigManager() { return this.configManager; }
  public getEventBus() { return this.eventBus; }

  public async handleRequest(sessionId: string, input: string, stream = false): Promise<AsyncIterable<string> | string> {
    const requestId = crypto.randomUUID();
    
    return runWithContext({ requestId, sessionId }, async () => {
      logger.info('runtime', 'message.received', `Handling request for session ${sessionId}`);
      this.eventBus.publish('message.received', { sessionId, input });

      try {
        this.sessionManager.getSession(sessionId);
      } catch {
        this.sessionManager.createSession(sessionId);
        this.eventBus.publish('session.created', { sessionId });
      }

      const config = this.configManager.getConfig();
      const model = this.activeProvider.getModel(config.activeModel);

      const ctx: PipelineContext = {
        sessionId,
        userPrompt: input,
        session: null as any,
        model,
        toolRegistry: this.toolRegistry,
        history: []
      };

      await this.contextBuilder.buildContext(ctx);
      await this.planner.plan(ctx);

      let toolExecutionOccurred = false;
      do {
        this.eventBus.publish('provider.request.started', { modelId: model.id });
        await this.providerExecutor.execute(ctx, stream);
        this.eventBus.publish('provider.request.completed', { modelId: model.id });
        
        toolExecutionOccurred = await this.toolExecutor.executeTools(ctx);
        if (toolExecutionOccurred) {
          await this.observationHandler.handle(ctx);
          // Reload history for next provider loop
          ctx.history = this.sessionManager.getMessages(ctx.sessionId) as any;
        }
      } while (toolExecutionOccurred && !stream); 
      // If streaming is requested and tool calls exist, we must break here for Phase 1.1 or handle tool calls natively if the provider stream doesn't stream text.
      // But in Phase 1.1 OpenAI SDK will handle stream logic.
      
      const response = await this.responseBuilder.buildResponse(ctx);
      return response;
    });
  }
}
