import { UIEvent } from './EventStreamAdapter';

export class ReplayAdapter {
  private events: UIEvent[] = [];
  private cursor = 0;
  private listeners: ((batch: UIEvent[]) => void)[] = [];

  constructor(events: UIEvent[]) {
    this.events = events;
  }

  public subscribe(fn: (batch: UIEvent[]) => void) {
    this.listeners.push(fn);
  }

  public stepForward() {
    if (this.cursor < this.events.length) {
      const event = this.events[this.cursor];
      this.cursor++;
      this.notify([event]);
    }
  }

  public stepBackward() {
    if (this.cursor > 0) {
      this.cursor--;
      // In a real replay, stepping backward means we probably have to recalculate state from 0 to cursor,
      // or we dispatch a special 'undo' event.
      // For now, we simply move the cursor. UI projection handles cursor-based slice rendering.
    }
  }

  public jump(offset: number) {
    this.cursor = Math.max(0, Math.min(this.events.length, this.cursor + offset));
  }

  public getCursor() {
    return this.cursor;
  }

  public getTotal() {
    return this.events.length;
  }

  public getSnapshot() {
    return this.events.slice(0, this.cursor);
  }

  private notify(batch: UIEvent[]) {
    this.listeners.forEach(fn => fn(batch));
  }
}
