import { BrainQuery, KnowledgeItem } from './models';

export interface KnowledgeRetriever {
  /**
   * Identifies the type of the retriever.
   */
  readonly type: string;

  /**
   * Executes the retrieval process for a given query.
   * @param query The BrainQuery containing intent and parameters.
   * @returns A promise resolving to an array of KnowledgeItems.
   */
  retrieve(query: BrainQuery): Promise<KnowledgeItem[]>;
}
