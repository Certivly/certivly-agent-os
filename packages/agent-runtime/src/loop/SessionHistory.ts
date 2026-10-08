import { SessionManager } from '@agent-os/sessions';
import type { LoopMessage, LoopToolCall } from './types';
import { redactSecrets } from '../trace/RunTracer';

export class SessionHistory {
  constructor(private sessionManager: SessionManager) {}

  public getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  private ensureSession(sessionId: string): void {
    try {
      this.sessionManager.getSession(sessionId);
    } catch {
      this.sessionManager.createSession(sessionId);
    }
  }

  public async load(sessionId: string): Promise<LoopMessage[]> {
    this.ensureSession(sessionId);
    const rawMessages = this.sessionManager.getMessages(sessionId);
    const result: LoopMessage[] = [];

    for (const msg of rawMessages) {
      if (msg.role === 'user' || msg.role === 'system') {
        result.push({
          id: msg.id,
          role: msg.role as 'user' | 'system',
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        let parsed: any;
        try {
          parsed = JSON.parse(msg.content);
        } catch {
          parsed = null;
        }

        if (parsed && typeof parsed === 'object' && ('toolCalls' in parsed || 'text' in parsed)) {
          result.push({
            id: msg.id,
            role: 'assistant',
            content: parsed.text ?? '',
            toolCalls: parsed.toolCalls,
          });
        } else {
          result.push({
            id: msg.id,
            role: 'assistant',
            content: msg.content,
          });
        }
      } else if (msg.role === 'tool') {
        let parsed: any;
        try {
          parsed = JSON.parse(msg.content);
        } catch {
          parsed = null;
        }

        if (parsed && typeof parsed === 'object' && ('toolCallId' in parsed || 'name' in parsed)) {
          result.push({
            id: msg.id,
            role: 'tool',
            content: parsed.content ?? '',
            name: parsed.name,
            toolCallId: parsed.toolCallId,
            isError: Boolean(parsed.isError),
          });
        } else {
          result.push({
            id: msg.id,
            role: 'tool',
            content: msg.content,
          });
        }
      } else {
        result.push({
          id: msg.id,
          role: msg.role as any,
          content: msg.content,
        });
      }
    }

    return result;
  }

  public async appendUser(sessionId: string, content: string): Promise<void> {
    this.ensureSession(sessionId);
    this.sessionManager.addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    });
  }

  public async appendSystem(sessionId: string, content: string): Promise<void> {
    this.ensureSession(sessionId);
    this.sessionManager.addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: 'system',
      content,
    });
  }

  public async appendAssistant(
    sessionId: string,
    content: string,
    toolCalls?: any[]
  ): Promise<void> {
    this.ensureSession(sessionId);
    const messageId = crypto.randomUUID();

    // TODO: Session package schema does not natively store tool-call metadata columns on messages; metadata is encoded in content JSON.
    if (toolCalls && toolCalls.length > 0) {
      const normalizedCalls: LoopToolCall[] = toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        args: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args ?? {}),
      }));

      const payload = {
        text: content,
        toolCalls: normalizedCalls,
      };

      this.sessionManager.addMessage(sessionId, {
        id: messageId,
        role: 'assistant',
        content: JSON.stringify(payload),
      });

      for (const tc of normalizedCalls) {
        try {
          this.sessionManager.addToolCall({
            id: tc.id,
            messageId,
            name: tc.name,
            args: tc.args,
          });
        } catch {
          // Ignore secondary insert errors if any
        }
      }
    } else {
      this.sessionManager.addMessage(sessionId, {
        id: messageId,
        role: 'assistant',
        content,
      });
    }
  }

  public async appendTool(
    sessionId: string,
    toolCallId: string,
    name: string,
    content: string,
    isError: boolean = false
  ): Promise<void> {
    this.ensureSession(sessionId);
    const messageId = crypto.randomUUID();

    const sanitizedContent = typeof content === 'string' ? redactSecrets(content) : content;

    // TODO: Session package schema does not natively store tool-call metadata columns on messages; metadata is encoded in content JSON.
    const payload = {
      toolCallId,
      name,
      content: sanitizedContent,
      isError: Boolean(isError),
    };

    this.sessionManager.addMessage(sessionId, {
      id: messageId,
      role: 'tool',
      content: JSON.stringify(payload),
    });

    try {
      this.sessionManager.updateToolCallResult(toolCallId, sanitizedContent);
    } catch {
      // Ignore if not found
    }
  }
}
