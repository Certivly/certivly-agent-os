import { EventBus } from '../../../daemon/src/streaming/EventBus';

export class EventStorm {
  constructor(private bus: EventBus) {}

  public async flood(totalEvents: number, durationMs: number) {
    const batchSize = 1000;
    const batches = totalEvents / batchSize;
    const delayPerBatch = durationMs / batches;

    let sent = 0;
    for (let b = 0; b < batches; b++) {
      for (let i = 0; i < batchSize; i++) {
        this.bus.publish({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          channel: 'storm-channel',
          topic: 'storm.event',
          payload: { index: sent++ }
        });
      }
      await new Promise(r => setTimeout(r, delayPerBatch));
    }
  }
}
