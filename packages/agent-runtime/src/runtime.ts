import { ConfigManager, AgentConfig } from '@agent-os/config';
import { SessionManager } from '@agent-os/sessions';
import { ToolRegistry, readFileTool, writeFileTool, listFilesTool, searchFilesTool, runCommandTool } from '@agent-os/tools';
import { Provider, OpenAIProvider, AnthropicProvider, LMStudioProvider, GeminiProvider, DeepSeekProvider, OpenRouterProvider, OllamaProvider } from '@agent-os/providers';
import { RuntimeError, logger, runWithContext, LoggingEventBus } from '@agent-os/shared';
import { RuntimeBootstrap, RuntimePipeline } from '@agent-os/runtime-integration';
import * as path from 'path';

export interface RuntimeOptions {
  configPath: string;
}

export class AgentRuntime {
  private configManager: ConfigManager;
  private sessionManager: SessionManager;
  private toolRegistry: ToolRegistry;
  private activeProvider: Provider;
  
  private bootstrap: RuntimeBootstrap;
  private pipelinePromise: Promise<RuntimePipeline>;

  constructor(options: RuntimeOptions, sessionId: string = 'default') {
    this.configManager = new ConfigManager(options.configPath);
    const config = this.configManager.load();

    const dbPath = path.join(process.cwd(), config.runtime.sessionDir, 'sessions.db');
    this.sessionManager = new SessionManager(dbPath);

    this.toolRegistry = new ToolRegistry();
    this.activeProvider = this.initializeProvider(config);

    this.registerStandardTools();

    // The entire architectural intelligence payload and infrastructure dependencies
    // (events, memory, sandbox, planner, pattern-intelligence, etc)
    // are now isolated in the RuntimeContainer via RuntimeBootstrap.
    this.bootstrap = new RuntimeBootstrap();
    const activeModel = this.activeProvider.getModel(config.activeModel);
    this.pipelinePromise = this.bootstrap.bootstrap(this.activeProvider, activeModel);
    
    // Wire up Narrative Engine
    const NarrativeEngine = require('@agent-os/narrative').NarrativeEngine;
    new NarrativeEngine(this.bootstrap.getEventBus(), sessionId);

    // Check provider health at startup and publish event
    this.pipelinePromise.then(async () => {
      const health = await this.activeProvider.checkHealth();
      const bus = this.bootstrap.getEventBus();
      if (!health.ok) {
        bus.publish('provider.health.failed', { sessionId: 'system', error: health.error });
      } else {
        bus.publish('provider.health.ok', { sessionId: 'system' });
      }
    }).catch(() => {});
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
      case 'openai': return new OpenAIProvider(config.providers['openai']?.apiKey, config.providers['openai']?.baseUrl);
      case 'lmstudio': return new LMStudioProvider(config.providers['lmstudio']?.apiKey, config.providers['lmstudio']?.baseUrl);
      case 'anthropic': return AnthropicProvider;
      case 'gemini': return GeminiProvider;
      case 'deepseek': return DeepSeekProvider;
      case 'openrouter': return OpenRouterProvider;
      case 'ollama': return OllamaProvider;
      default: throw new RuntimeError(`Unsupported provider: ${config.activeProvider}`);
    }
  }

  public getSessionManager() { return this.sessionManager; }
  public getConfigManager() { return this.configManager; }
  
  // To satisfy external UI streams, we fetch the centralized event bus from the container bootstrap
  public getEventBus(): LoggingEventBus {
    return this.bootstrap.getEventBus();
  }

  public getBootstrap(): RuntimeBootstrap {
    return this.bootstrap;
  }

  public async handleRequest(sessionId: string, input: string, stream = false): Promise<AsyncIterable<string> | string> {
    const requestId = crypto.randomUUID();
    
    return runWithContext({ requestId, sessionId }, async () => {
      logger.info('runtime', 'message.received', `Handling request via autonomous production pipeline for session ${sessionId}`);
      const eventBus = this.getEventBus();
      eventBus.publish('message.received', { sessionId, input });

      if (this.activeProvider) {
        this.bootstrap.getRegistry().register("provider", this.activeProvider);
      }
      if (this.activeModel) {
        this.bootstrap.getRegistry().register("model", this.activeModel);
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

      // Delegate pure execution to RuntimePipeline
      const pipeline = await this.pipelinePromise;
      const approvalPackage = await pipeline.execute(sessionId, input);
      
      if (approvalPackage?.executionResult?.error?.includes('Provider timeout')) {
        throw new ProviderError('Provider timeout');
      }
      
      try {
        const memoryStore: any = this.bootstrap.getRegistry().resolve("memory-store");
        if (memoryStore) {
          memoryStore.save({
            id: crypto.randomUUID(),
            type: 'FactMemory',
            topic: input.slice(0, 50),
            content: `Goal: "${input}". Risk score: ${approvalPackage.planSummary?.riskScore ?? 0}. Success: ${approvalPackage.executionResult?.success ?? false}.`,
            confidence: 0.9,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceEventIds: [],
            sourceSessionIds: [sessionId],
            sourceRequestIds: [requestId],
            sourceContextIds: [],
            tags: ['execution_result'],
            version: 1
          });
        }
      } catch (err: any) {
        logger.error('runtime', 'memory.save.error', `Failed to save execution to memory: ${err.message}`);
      }
      
      const response = JSON.stringify(approvalPackage, null, 2);

      eventBus.publish('message.responded', { sessionId, response });
      
      return response;
    });
  }
}
