import { BrainQuery, KnowledgeItem, RankedKnowledge, BrainAgentContext } from './models';

export class RetrievalSession {
  public readonly id: string;
  public readonly startTime: number;
  public query: BrainQuery;
  public retrievedItems: KnowledgeItem[] = [];
  public rankedKnowledge: RankedKnowledge[] = [];
  public context?: BrainAgentContext;

  constructor(query: BrainQuery) {
    this.id = Math.random().toString(36).slice(2);
    this.startTime = Date.now();
    this.query = query;
  }

  public getDuration(): number {
    return Date.now() - this.startTime;
  }
}
