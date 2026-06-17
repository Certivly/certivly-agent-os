import { ConfigManager, AgentConfig } from '@agent-os/config';
import { SessionManager } from '@agent-os/sessions';
import { ToolRegistry, readFileTool, writeFileTool, listFilesTool, searchFilesTool, runCommandTool } from '@agent-os/tools';
import { Provider, OpenAIProvider, AnthropicProvider, GeminiProvider, DeepSeekProvider, OpenRouterProvider, OllamaProvider } from '@agent-os/providers';
import { RuntimeError, logger, runWithContext, agentContext, LoggingEventBus } from '@agent-os/shared';
import { EventStore } from '@agent-os/events';
import { ContextStack, ContextEntry } from '@agent-os/context';
import { MemoryStore, MemoryExtractor } from '@agent-os/memory';
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
  private eventStore: EventStore;
  private memoryStore: MemoryStore;
  private memoryExtractor: MemoryExtractor;
  private contextStack: ContextStack;

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
    
    // Initialize EventStore
    const eventsDbPath = path.join(process.cwd(), config.runtime.sessionDir, 'events.db');
    this.eventStore = new EventStore(eventsDbPath);

    // Initialize Memory Engine
    const memoryDbPath = path.join(process.cwd(), config.runtime.sessionDir, 'memory.db');
    this.memoryStore = new MemoryStore(memoryDbPath);
    this.memoryExtractor = new MemoryExtractor(this.memoryStore);

    // Initialize Context Stack
    this.contextStack = new ContextStack({ maxEntries: 100 }, this.memoryExtractor);

    // Hook Event Bus to Event Store
    this.eventBus.subscribe('*', (e) => {
      this.eventStore.append({
        id: e.id,
        eventType: e.type,
        timestamp: e.timestamp,
        requestId: e.correlationId || 'unknown',
        sessionId: e.sessionId || 'unknown',
        source: 'runtime',
        payload: e.payload,
        version: '1.0'
      });
    });

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
      const userEventId = this.eventBus.publish('message.received', { sessionId, input });

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

      // Push user message to context stack
      await this.contextStack.push({
        id: crypto.randomUUID(),
        type: 'MessageContext',
        content: `User: ${input}`,
        timestamp: new Date().toISOString(),
        sourceEventIds: [userEventId]
      });

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
          
          // Push tool execution result to context stack
          const lastMsg = ctx.history[ctx.history.length - 1];
          if (lastMsg && lastMsg.role === 'tool') {
             const toolEventId = this.eventBus.publish('tool.execution.result.captured', { toolResult: lastMsg.content });
             await this.contextStack.push({
               id: crypto.randomUUID(),
               type: 'ToolContext',
               content: `Tool Execution Result: ${lastMsg.content}`,
               timestamp: new Date().toISOString(),
               sourceEventIds: [toolEventId]
             });
          }
        }
      } while (toolExecutionOccurred && !stream); 
      
      const response = await this.responseBuilder.buildResponse(ctx);

      // Push response to context stack
      if (typeof response === 'string') {
        const responseEventId = this.eventBus.publish('message.responded', { sessionId, response });
        await this.contextStack.push({
          id: crypto.randomUUID(),
          type: 'MessageContext',
          content: `Assistant: ${response}`,
          timestamp: new Date().toISOString(),
          sourceEventIds: [responseEventId]
        });
      }

      return response;
    });
  }
}
