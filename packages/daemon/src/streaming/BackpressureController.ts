import { StreamEvent } from './EventBus';

export class BackpressureController {
  constructor(
    private maxBufferSize: number = 10000,
    private dropRatio: number = 0.2 // Drop oldest 20% when full
  ) {}

  public applyBackpressure(buffer: StreamEvent[]): StreamEvent[] {
    if (buffer.length <= this.maxBufferSize) {
      return buffer;
    }

    // Drop logic: remove the oldest (except critical events if we had type checking)
    const dropCount = Math.floor(this.maxBufferSize * this.dropRatio);
    return buffer.slice(dropCount);
  }
}
