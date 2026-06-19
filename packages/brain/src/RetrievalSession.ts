import { BrainQuery, KnowledgeItem, RankedKnowledge, AgentContext, BrainResponse } from './models';
import { v4 as uuidv4 } from 'uuid';

export class RetrievalSession {
  public readonly id: string;
  public readonly startTime: number;
  public query: BrainQuery;
  
  public retrievedItems: KnowledgeItem[] = [];
  public rankedKnowledge: RankedKnowledge[] = [];
  public context?: AgentContext;

  constructor(query: BrainQuery) {
    this.id = uuidv4();
    this.startTime = Date.now();
    this.query = query;
  }

  public getDuration(): number {
    return Date.now() - this.startTime;
  }

  public generateResponseText(): string {
    if (!this.context) return '';
    
    // A simplified textual representation of the assembled context
    let text = `Context Assembly for Query: "${this.query.query}"\n\n`;
    text += `Intent: ${this.query.intent}\n`;
    text += `Intelligence Score: ${this.context.score.confidence.toFixed(2)} confidence\n\n`;
    
    text += `### Retrieved Knowledge:\n`;
    this.context.knowledge.forEach(item => {
      text += `- [${item.type}] (Score: ${item.finalScore.toFixed(2)}) Traceable: ${item.confidence.traceable}\n`;
      text += `  Content: ${JSON.stringify(item.content)}\n`;
    });

    return text;
  }

  public toResponse(): BrainResponse {
    if (!this.context) {
      throw new Error('Context has not been assembled yet.');
    }

    return {
      context: this.context,
      assembledText: this.generateResponseText()
    };
  }
}
