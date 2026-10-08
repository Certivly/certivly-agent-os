import { BrainQuery, KnowledgeItem } from './models';

export class KnowledgeScorer {
  /**
   * Scores a set of KnowledgeItems based on the query.
   */
  public score(query: BrainQuery, items: KnowledgeItem[]): KnowledgeItem[] {
    return items.map(item => {
      // Default scores if not provided by the retriever
      const recencyScore = item.recencyScore ?? 0.5;
      const frequencyScore = item.frequencyScore ?? 0.5;
      const traceabilityScore = item.confidence.traceable ? 1.0 : 0.0;
      
      // Calculate a combined final score
      // Weight traceability very highly, then recency and frequency
      const finalScore = 
        (traceabilityScore * 0.4) +
        (recencyScore * 0.3) +
        (frequencyScore * 0.3);

      return {
        ...item,
        finalScore
      };
    });
  }
}
