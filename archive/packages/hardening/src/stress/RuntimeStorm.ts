import { RequestScheduler } from '../../../daemon/src/scheduler/RequestScheduler';

export class RuntimeStorm {
  constructor(private scheduler: RequestScheduler) {}

  public async overload(totalRequests: number) {
    const promises = [];
    for (let i = 0; i < totalRequests; i++) {
      promises.push(this.scheduler.schedule({
        id: `storm-req-${i}`,
        type: 'STORM_PING',
        payload: { index: i }
      }).catch(e => {
        // Ignore timeouts in storm
      }));
    }
    await Promise.all(promises);
  }
}
