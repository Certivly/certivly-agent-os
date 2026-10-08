import { EventBus } from '../../../daemon/src/streaming/EventBus';

export class RepositoryStorm {
  constructor(private bus: EventBus) {}

  public async simulate(repoId: string, eventsPerMinute: number) {
    const delayMs = 60000 / eventsPerMinute;
    console.log(`Starting repository storm: ${eventsPerMinute} events/min on ${repoId}`);

    for (let i = 0; i < eventsPerMinute; i++) {
      this.bus.publish({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        channel: `repo:${repoId}`,
        topic: 'daemon.repository.updated',
        payload: {
          repositoryId: repoId,
          eventName: 'change',
          path: `src/file-${i}.ts`
        }
      });
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}
