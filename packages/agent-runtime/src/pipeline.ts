import { Session, Message, ToolCall } from '@agent-os/sessions';
import { Model, Provider } from '@agent-os/providers';
import { ToolRegistry } from '@agent-os/tools';

export interface PipelineContext {
  sessionId: string;
  userPrompt: string;
  session: Session;
  model: Model;
  toolRegistry: ToolRegistry;
  history: Message[]; // from context builder
  currentResponse?: AsyncIterable<string> | string; // streaming or buffered output
  toolCalls?: ToolCall[];
}

export interface ContextBuilder {
  buildContext(ctx: PipelineContext): Promise<void>;
}

export interface Planner {
  plan(ctx: PipelineContext): Promise<void>;
}

export interface ProviderExecutor {
  execute(ctx: PipelineContext, stream: boolean): Promise<void>;
}

export interface ToolExecutorStage {
  executeTools(ctx: PipelineContext): Promise<boolean>; // Returns true if tools were executed
}

export interface ObservationHandler {
  handle(ctx: PipelineContext): Promise<void>;
}

export interface ResponseBuilder {
  buildResponse(ctx: PipelineContext): Promise<AsyncIterable<string> | string>;
}
