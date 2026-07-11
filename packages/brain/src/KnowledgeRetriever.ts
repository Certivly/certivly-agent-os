import { BrainQuery, KnowledgeItem } from '../models';

export interface KnowledgeRetriever {
  readonly type: string;
  retrieve(query: BrainQuery): Promise<KnowledgeItem[]>;
}
