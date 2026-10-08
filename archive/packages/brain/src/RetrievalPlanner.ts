import { BrainQuery, QueryType } from './models';

export type RetrievalPlan = {
  sources: string[];
  priority: string[];
  maxItemsPerSource: number;
};

export class RetrievalPlanner {
  /**
   * Determines which knowledge sources to query based on QueryType.
   */
  public plan(query: BrainQuery): RetrievalPlan {
    const plan: RetrievalPlan = {
      sources: [],
      priority: [],
      maxItemsPerSource: query.limit ? Math.ceil(query.limit / 2) : 20
    };

    switch (query.intent) {
      case QueryType.ARCHITECTURE:
        plan.sources = ['graph', 'wicer', 'memory'];
        plan.priority = ['wicer', 'graph'];
        break;
      case QueryType.SYMBOL:
      case QueryType.DEPENDENCY:
        plan.sources = ['graph'];
        plan.priority = ['graph'];
        break;
      case QueryType.HISTORY:
      case QueryType.BUG:
        plan.sources = ['event', 'memory', 'wicer'];
        plan.priority = ['event', 'memory'];
        break;
      case QueryType.CONVENTION:
        plan.sources = ['memory', 'wicer'];
        plan.priority = ['memory'];
        break;
      case QueryType.EXECUTION:
        plan.sources = ['wicer', 'graph', 'event'];
        plan.priority = ['wicer'];
        break;
      default:
        plan.sources = ['graph', 'wicer', 'memory', 'event'];
        plan.priority = ['memory', 'graph'];
        break;
    }

    return plan;
  }
}
