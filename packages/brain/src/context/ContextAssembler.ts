import { BrainQuery, RankedKnowledge, RepositoryIntelligenceScore } from '../models';
import { MemoryStore } from '@agent-os/memory';

/**
 * ContextAssembler — merged from @agent-os/context (RuntimeContextAssembler)
 * and brain's own ContextAssembler.
 *
 * Responsibilities:
 *   1. Score retrieved knowledge items by coverage type
 *   2. Assemble a fully structured system prompt string for the LLM
 */
export class ContextAssembler {

  constructor(private memoryStore?: MemoryStore) {}

  // ─── Knowledge Scoring (former brain/ContextAssembler) ────────────────────

  public scoreKnowledge(query: BrainQuery, rankedKnowledge: RankedKnowledge[]): {
    query: BrainQuery;
    knowledge: RankedKnowledge[];
    score: RepositoryIntelligenceScore;
  } {
    const graphCoverage    = this.calcCoverage(rankedKnowledge, 'graph');
    const wikiCoverage     = this.calcCoverage(rankedKnowledge, 'wicer');
    const memoryCoverage   = this.calcCoverage(rankedKnowledge, 'memory');
    const retrievalCoverage = (graphCoverage + wikiCoverage + memoryCoverage) / 3;

    const avgConfidence = rankedKnowledge.length > 0
      ? rankedKnowledge.reduce((a, k) => a + k.confidence.score, 0) / rankedKnowledge.length
      : 0;

    const score: RepositoryIntelligenceScore = {
      graphCoverage,
      wikiCoverage,
      memoryCoverage,
      retrievalCoverage,
      confidence: avgConfidence
    };

    return { query, knowledge: rankedKnowledge, score };
  }

  // ─── System Prompt Assembly (former @agent-os/context/RuntimeContextAssembler) ──

  /**
   * Assembles a structured system prompt for the LLM from all available context signals.
   */
  public assemble(options: {
    goal: string;
    repositorySnapshot?: any;
    patternSnapshot?: any;
    knowledgeUnits?: any[];
    rankedKnowledge?: RankedKnowledge[];
  }): string {
    const sections: string[] = [];

    // 1. Core agent persona
    sections.push(
      `You are the AgentOS Core reasoning agent. You are pair programming in a workspace. ` +
      `Your code modifications must adhere strictly to existing repository architecture, ` +
      `pattern constraints, and conventions.`
    );

    // 2. Repository structural context
    if (options.repositorySnapshot) {
      const fileCount   = options.repositorySnapshot.files?.size ?? 0;
      const symbolCount = options.repositorySnapshot.symbols?.size ?? 0;
      sections.push(
        `### Repository Summary\n` +
        `- Total Indexed Files: ${fileCount}\n` +
        `- Total Extracted Symbols: ${symbolCount}\n` +
        `- Workspace Root: ${process.cwd().replace(/\\/g, '/')}`
      );
    }

    // 3. Detected patterns / conventions (VITAL — prevents architectural violations)
    if (options.patternSnapshot?.patterns) {
      const list = options.patternSnapshot.patterns
        .map((p: any) =>
          `- **${p.title}** (${p.type}): ${p.description} (Confidence: ${Math.round((p.confidence ?? 0) * 100)}%)`
        )
        .join('\n');
      if (list) {
        sections.push(
          `### Detected Coding Conventions & Patterns\n` +
          `Your changes MUST conform to these conventions:\n` +
          list
        );
      }
    }

    // 4. WiCER knowledge units (granular file-level understanding)
    const wUnits = options.knowledgeUnits ?? [];
    if (wUnits.length > 0) {
      const ctx = wUnits
        .slice(0, 10)
        .map((u: any) => `- File \`${u.name ?? u.id}\`: ${u.description || u.content}`)
        .join('\n');
      sections.push(`### Workspace Knowledge (WiCER)\n` + ctx);
    }

    // 5. Ranked brain knowledge items (graph, memory, wicer from RAG pipeline)
    const ranked = options.rankedKnowledge ?? [];
    if (ranked.length > 0) {
      const ragCtx = ranked
        .slice(0, 8)
        .map(k => `- [${k.type}] ${k.id}: ${k.content?.slice(0, 120) ?? ''}`)
        .join('\n');
      sections.push(`### Retrieved Intelligence\n` + ragCtx);
    }

    // 6. Past memories relevant to this goal
    if (this.memoryStore) {
      try {
        const words = options.goal.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const allMemories = [
          ...this.memoryStore.getMemoriesByType('FactMemory'),
          ...this.memoryStore.getMemoriesByType('DecisionMemory'),
          ...this.memoryStore.getMemoriesByType('PatternMemory'),
          ...this.memoryStore.getMemoriesByType('TaskMemory')
        ];
        const matched = allMemories.filter(m =>
          words.some(w => m.content.toLowerCase().includes(w) || m.topic.toLowerCase().includes(w))
        );
        if (matched.length > 0) {
          const memList = matched
            .slice(0, 5)
            .map(m => `- **${m.topic}** (Confidence: ${m.confidence}): ${m.content}`)
            .join('\n');
          sections.push(
            `### Relevant Past Memories\n` +
            `Use this learning context to guide your execution:\n` +
            memList
          );
        }
      } catch (err: any) {
        // Safe fallback — memory read failure must not block execution
      }
    }

    return sections.join('\n\n');
  }

  private calcCoverage(knowledge: RankedKnowledge[], type: string): number {
    const items = knowledge.filter(k => k.type === type);
    return items.length > 0 ? Math.min(items.length / 10, 1.0) : 0;
  }
}
