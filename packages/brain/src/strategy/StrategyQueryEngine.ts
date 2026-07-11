import { Strategy } from '../models';
import { StrategyStore } from './StrategyStore';

export class StrategyQueryEngine {
  constructor(private store: StrategyStore) {}

  public getStrategies(): Strategy[] {
    return this.store.getAll();
  }

  public getById(id: string): Strategy | undefined {
    return this.store.get(id);
  }
}
