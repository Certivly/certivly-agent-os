import { SessionManager, MessageData, ToolCallData } from '@agent-os/sessions';
import { PipelineContext, ContextBuilder, Planner, ProviderExecutor, ToolExecutorStage, ObservationHandler, ResponseBuilder } from './pipeline';
import { logger } from '@agent-os/shared';

export class DefaultContextBuilder implements ContextBuilder {
  constructor(private sessionManager: SessionManager) {}

  async buildContext(ctx: PipelineContext): Promise<void> {
    // 1. Add user message
    const msgId = crypto.randomUUID();
    this.sessionManager.addMessage(ctx.sessionId, { id: msgId, role: 'user', content: ctx.userPrompt });
    
    // 2. Load history
    const session = this.sessionManager.getSession(ctx.sessionId);
    if (!session) throw new Error('Session not found');
    ctx.session = session as any;
    // In Phase 1.1 we fetch the messages
    ctx.history = this.sessionManager.getMessages(ctx.sessionId) as any;
    
    logger.debug('runtime', 'context.built', 'Context built', { messageCount: ctx.history.length });
  }
}

export class DefaultPlanner implements Planner {
  async plan(ctx: PipelineContext): Promise<void> {
    logger.debug('runtime', 'planner.run', 'Planner run complete');
  }
}

export class DefaultProviderExecutor implements ProviderExecutor {
  async execute(ctx: PipelineContext, stream: boolean): Promise<void> {
    logger.debug('runtime', 'provider.execute', 'Executing provider');
    
    const tools = ctx.toolRegistry.list().map(t => ({
      name: t.name,
      description: t.description,
      parameters: { type: 'object', properties: { path: { type: 'string' }, command: { type: 'string' }, content: { type: 'string' }, query: { type: 'string' } } }
    }));

    const providerMessages = ctx.history.map((m: any) => ({
      role: m.role,
      content: m.content || '',
      toolCalls: m.toolCalls,
      toolCallId: m.toolCallId
    }));

    if (stream && ctx.model.generateStream) {
      ctx.currentResponse = await ctx.model.generateStream({ messages: providerMessages, tools });
    } else {
      const resp = await ctx.model.generate({ messages: providerMessages, tools });
      ctx.currentResponse = resp.text || '';
      if (resp.toolCalls && resp.toolCalls.length > 0) {
        ctx.toolCalls = resp.toolCalls.map(tc => ({
          id: crypto.randomUUID(),
          name: tc.name,
          args: tc.args
        })) as any;
      }
    }
  }
}

export class DefaultToolExecutor implements ToolExecutorStage {
  constructor(private sessionManager: SessionManager) {}

  async executeTools(ctx: PipelineContext): Promise<boolean> {
    if (!ctx.toolCalls || ctx.toolCalls.length === 0) return false;

    const asstMsgId = crypto.randomUUID();
    this.sessionManager.addMessage(ctx.sessionId, { id: asstMsgId, role: 'assistant', content: `Using tools...` });

    for (const call of ctx.toolCalls as any[]) {
      logger.info('runtime', 'tool.execution.started', `Executing tool ${call.name}`, { toolCallId: call.id });
      
      this.sessionManager.addToolCall({
        id: call.id,
        messageId: asstMsgId,
        name: call.name,
        args: call.args
      });

      let toolResult = '';
      try {
        const tool = ctx.toolRegistry.getTool(call.name);
        toolResult = await tool.execute(JSON.parse(call.args));
        this.sessionManager.updateToolCallResult(call.id, toolResult);
        logger.info('runtime', 'tool.execution.completed', `Tool ${call.name} executed`, { toolCallId: call.id, result: toolResult });
      } catch (error: any) {
        toolResult = `Error: ${error.message}`;
        this.sessionManager.updateToolCallResult(call.id, toolResult);
        logger.error('runtime', 'tool.execution.error', `Tool ${call.name} failed`, { error: error.message });
      }

      const toolMsgId = crypto.randomUUID();
      this.sessionManager.addMessage(ctx.sessionId, { id: toolMsgId, role: 'tool', content: toolResult });
    }

    return true; 
  }
}

export class DefaultObservationHandler implements ObservationHandler {
  async handle(ctx: PipelineContext): Promise<void> {
    logger.debug('runtime', 'observation.handled', 'Observation complete');
  }
}

export class DefaultResponseBuilder implements ResponseBuilder {
  constructor(private sessionManager: SessionManager) {}

  async buildResponse(ctx: PipelineContext): Promise<AsyncIterable<string> | string> {
    if (typeof ctx.currentResponse === 'string') {
      if (!ctx.toolCalls || ctx.toolCalls.length === 0) {
        this.sessionManager.addMessage(ctx.sessionId, { id: crypto.randomUUID(), role: 'assistant', content: ctx.currentResponse });
      }
    }
    return ctx.currentResponse || '';
  }
}
