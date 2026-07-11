import { BrainQuery, BrainAgentContext, BrainResponse, QueryType, RankedKnowledge } from './models';
import { QueryClassifier } from './QueryClassifier';
import { RetrievalPlanner } from './RetrievalPlanner';
import { HybridRetriever } from './retrieval/HybridRetriever';
import { KnowledgeScorer } from './KnowledgeScorer';
import { KnowledgeRanker } from './KnowledgeRanker';

export class RepositoryBrain {
  private queryClassifier = new QueryClassifier();
  private retrievalPlanner = new RetrievalPlanner();
  private knowledgeScorer = new KnowledgeScorer();
  private knowledgeRanker = new KnowledgeRanker();

  constructor(private hybridRetriever: HybridRetriever) {}

  /**
   * Main entry point: given a goal string, retrieve + rank all relevant knowledge
   * and produce both a structured AgentContext and an assembled system-prompt text.
   */
  public async answer(goalOrQuery: string | BrainQuery): Promise<BrainResponse> {
    const query: BrainQuery = typeof goalOrQuery === 'string'
      ? { query: goalOrQuery, intent: QueryType.UNKNOWN, limit: 15 }
      : goalOrQuery;

    // 1. Classify
    query.intent = this.queryClassifier.classify(query.query);

    // 2. Plan which sources to hit
    const plan = this.retrievalPlanner.plan(query);

    // 3. Parallel retrieve
    const rawItems = await this.hybridRetriever.retrieve(query, plan);

    // 4. Score + Rank
    const scored = this.knowledgeScorer.score(query, rawItems);
    const ranked = this.knowledgeRanker.rank(query, scored);

    // 5. Compute coverage
    const coverage = this.computeCoverage(ranked);

    // 6. Assemble system prompt text
    const assembledText = this.buildSystemPrompt(query, ranked);

    const context: BrainAgentContext = {
      query,
      knowledge: ranked,
      score: coverage,
      assembledText
    };

    return { context, assembledText };
  }

  private buildSystemPrompt(query: BrainQuery, ranked: RankedKnowledge[]): string {
    const sections: string[] = [];

    sections.push(
      `You are the AgentOS Core reasoning agent. You are pair programming in a workspace.\n` +
      `Your code modifications must adhere strictly to existing repository architecture, pattern constraints, and conventions.\n` +
      `Goal classification: ${query.intent}.`
    );

    const graphItems = ranked.filter(k => k.type === 'graph').slice(0, 5);
    if (graphItems.length > 0) {
      sections.push(
        `### Repository Structure\n` +
        graphItems.map(k => {
          const c = k.content;
          return `- \`${c.path || c.id || JSON.stringify(c).slice(0, 80)}\``;
        }).join('\n')
      );
    }

    const wicerItems = ranked.filter(k => k.type === 'wicer').slice(0, 8);
    if (wicerItems.length > 0) {
      sections.push(
        `### Relevant Code Knowledge (WiCER)\n` +
        wicerItems.map(k => {
          const u = k.content;
          return `- **${u.name || u.id}**: ${u.description || u.content || ''}`;
        }).join('\n')
      );
    }

    const memoryItems = ranked.filter(k => k.type === 'memory').slice(0, 5);
    if (memoryItems.length > 0) {
      sections.push(
        `### Relevant Past Executions\n` +
        `Use this learning context to guide your implementation:\n` +
        memoryItems.map(k => {
          const m = k.content;
          return `- **${m.topic}** (confidence ${m.confidence ?? k.confidence.score}): ${m.content}`;
        }).join('\n')
      );
    }

    const eventItems = ranked.filter(k => k.type === 'event').slice(0, 3);
    if (eventItems.length > 0) {
      sections.push(
        `### Recent Relevant Events\n` +
        eventItems.map(k => {
          const e = k.content;
          return `- [${e.eventType || e.type}] ${JSON.stringify(e.payload || {}).slice(0, 100)}`;
        }).join('\n')
      );
    }

    return sections.join('\n\n');
  }

  private computeCoverage(ranked: RankedKnowledge[]) {
    const count = (type: string) => ranked.filter(k => k.type === type).length;
    const g = Math.min(count('graph') / 5, 1);
    const w = Math.min(count('wicer') / 8, 1);
    const m = Math.min(count('memory') / 5, 1);
    return {
      graphCoverage: g,
      wikiCoverage: w,
      memoryCoverage: m,
      retrievalCoverage: (g + w + m) / 3,
      confidence: ranked.length > 0
        ? ranked.reduce((s, k) => s + k.confidence.score, 0) / ranked.length
        : 0
    };
  }
}
