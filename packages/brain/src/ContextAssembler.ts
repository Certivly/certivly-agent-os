import { BrainQuery, RankedKnowledge, BrainAgentContext, RepositoryIntelligenceScore } from './models';

export class ContextAssembler {
  /**
   * Assembles ranked knowledge into an AgentContext.
   */
  public assemble(query: BrainQuery, rankedKnowledge: RankedKnowledge[]): AgentContext {
    // Calculate a mock score for now based on the assembled knowledge
    const graphCoverage = this.calculateCoverage(rankedKnowledge, 'graph');
    const wikiCoverage = this.calculateCoverage(rankedKnowledge, 'wicer');
    const memoryCoverage = this.calculateCoverage(rankedKnowledge, 'memory');
    
    // Total coverage metric (simplified)
    const retrievalCoverage = (graphCoverage + wikiCoverage + memoryCoverage) / 3;
    
    // Average confidence across all ranked items
    const avgConfidence = rankedKnowledge.length > 0 
      ? rankedKnowledge.reduce((acc, item) => acc + item.confidence.score, 0) / rankedKnowledge.length 
      : 0;

    const score: RepositoryIntelligenceScore = {
      graphCoverage,
      wikiCoverage,
      memoryCoverage,
      retrievalCoverage,
      confidence: avgConfidence
    };

    return {
      query,
      knowledge: rankedKnowledge,
      score
    };
  }

  private calculateCoverage(knowledge: RankedKnowledge[], type: string): number {
    const itemsOfType = knowledge.filter(k => k.type === type);
    // Simplified coverage metric (0 to 1)
    return itemsOfType.length > 0 ? Math.min(itemsOfType.length / 10, 1.0) : 0.0;
  }
}
