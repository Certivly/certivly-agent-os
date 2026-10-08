export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
}

export class AgentMessageBus {
  private subscribers: Map<string, ((msg: AgentMessage) => void)[]> = new Map();

  public subscribe(type: string, handler: (msg: AgentMessage) => void) {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, []);
    }
    this.subscribers.get(type)!.push(handler);
  }

  public publish(msg: AgentMessage) {
    const handlers = this.subscribers.get(msg.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(msg);
      }
    }
  }
}
