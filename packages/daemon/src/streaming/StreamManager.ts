import { EventBus, StreamEvent } from './EventBus';
import { StreamReplayBuffer } from './StreamReplayBuffer';
import { Transport } from '../api/Transport';

export class StreamManager {
  private buffers = new Map<string, StreamReplayBuffer>(); // By Session ID

  constructor(
    private bus: EventBus,
    private transport: Transport
  ) {
    // Listen to all session events and buffer them
    this.bus.subscribe('*', (event) => {
      if (event.channel.startsWith('session:')) {
        const sessionId = event.channel.split(':')[1];
        if (sessionId) {
          this.getBuffer(sessionId).add(event);
          // Assuming payload specifies the client ID or broadcast is used safely
          // Real impl would map sessionId to clientId
          this.transport.broadcast(event);
        }
      }
    });
  }

  public replayToClient(clientId: string, sessionId: string, sinceTimestamp: number): void {
    const buffer = this.getBuffer(sessionId);
    const events = buffer.getEventsAfter(sinceTimestamp);
    
    for (const event of events) {
      this.transport.send(clientId, { type: 'REPLAY_EVENT', event });
    }
  }

  private getBuffer(sessionId: string): StreamReplayBuffer {
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, new StreamReplayBuffer());
    }
    return this.buffers.get(sessionId)!;
  }
}
