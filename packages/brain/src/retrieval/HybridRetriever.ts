import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';
import { RetrievalPlan } from '../RetrievalPlanner';

export class HybridRetriever {
  private retrievers: Map<string, KnowledgeRetriever> = new Map();

  constructor(retrievers: KnowledgeRetriever[]) {
    for (const retriever of retrievers) {
      this.retrievers.set(retriever.type, retriever);
    }
  }

  /**
   * Simultaneously executes the planned retrievers and gathers all KnowledgeItems.
   */
  public async retrieve(query: BrainQuery, plan: RetrievalPlan): Promise<KnowledgeItem[]> {
    const retrievePromises: Promise<KnowledgeItem[]>[] = [];

    for (const source of plan.sources) {
      const retriever = this.retrievers.get(source);
      if (retriever) {
        // Here we could pass down plan.maxItemsPerSource if the retriever supported it
        retrievePromises.push(retriever.retrieve(query));
      } else {
        console.warn(`No retriever registered for source type: ${source}`);
      }
    }

    const results = await Promise.all(retrievePromises);
    
    // Flatten the array of arrays
    return results.flat();
  }
}
