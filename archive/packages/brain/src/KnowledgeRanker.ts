import { BrainQuery, KnowledgeItem, RankedKnowledge } from './models';

export class KnowledgeRanker {
  /**
   * Ranks scored KnowledgeItems and optionally truncates them based on the query limit.
   */
  public rank(query: BrainQuery, items: KnowledgeItem[]): RankedKnowledge[] {
    // Filter out items without a final score
    const validItems = items.filter(item => item.finalScore !== undefined) as RankedKnowledge[];

    // Sort descending by finalScore
    validItems.sort((a, b) => b.finalScore - a.finalScore);

    // Apply limit if specified
    if (query.limit && query.limit > 0) {
      return validItems.slice(0, query.limit);
    }

    return validItems;
  }
}
