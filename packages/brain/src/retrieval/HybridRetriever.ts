import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';
import { RetrievalPlan } from '../RetrievalPlanner';

export class HybridRetriever {
  private retrievers: Map<string, KnowledgeRetriever> = new Map();

  constructor(retrievers: KnowledgeRetriever[]) {
    for (const r of retrievers) {
      this.retrievers.set(r.type, r);
    }
  }

  public async retrieve(query: BrainQuery, plan: RetrievalPlan): Promise<KnowledgeItem[]> {
    const promises: Promise<KnowledgeItem[]>[] = [];

    for (const source of plan.sources) {
      const retriever = this.retrievers.get(source);
      if (retriever) {
        promises.push(retriever.retrieve(query));
      }
    }

    const results = await Promise.all(promises);
    return results.flat();
  }
}
