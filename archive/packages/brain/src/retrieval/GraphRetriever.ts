import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';

export interface GraphStore {
  queryNodes?(query: string): Promise<any[]>;
  files?: Map<any, any>;
  symbols?: Map<any, any>;
}

export function tokenizeText(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-zA-Z0-9_]+/)
    .filter(t => t.length > 1);
}

export function computeBM25Score(queryTokens: string[], targetText: string, pathWeight = 1.0): number {
  if (queryTokens.length === 0 || !targetText) return 0;
  const targetTokens = tokenizeText(targetText);
  if (targetTokens.length === 0) return 0;

  let score = 0;
  const targetLower = targetText.toLowerCase();

  for (const q of queryTokens) {
    let termFreq = 0;
    for (const t of targetTokens) {
      if (t === q) termFreq += 1;
      else if (t.includes(q)) termFreq += 0.5;
    }

    if (termFreq > 0) {
      // BM25-style frequency saturation
      const tfScore = (termFreq * 2.2) / (termFreq + 1.2 * (0.25 + 0.75 * (targetTokens.length / 50)));
      score += tfScore * pathWeight;
    } else if (targetLower.includes(q)) {
      score += 0.5 * pathWeight;
    }
  }

  return score;
}

export class GraphRetriever implements KnowledgeRetriever {
  public readonly type = 'graph';

  constructor(private graphStore?: GraphStore) {}

  public async retrieve(query: BrainQuery): Promise<KnowledgeItem[]> {
    if (!this.graphStore) return [];

    // Use queryNodes if available
    if (typeof this.graphStore.queryNodes === 'function') {
      const nodes = await this.graphStore.queryNodes(query.query);
      return nodes.map(node => ({
        id: node.id || String(Math.random()),
        type: this.type as any,
        content: node,
        confidence: { score: 0.9, sources: [node.id || 'graph-node'], traceable: true },
      }));
    }

    const queryTokens = tokenizeText(query.query);
    if (queryTokens.length === 0) return [];

    const scoredItems: Array<{ item: KnowledgeItem; score: number }> = [];

    // Search files map
    if (this.graphStore.files) {
      for (const [filePath, info] of (this.graphStore.files as Map<string, any>)) {
        const score = computeBM25Score(queryTokens, String(filePath), 1.5);
        if (score > 0) {
          scoredItems.push({
            score,
            item: {
              id: String(filePath),
              type: this.type as any,
              content: { path: filePath, ...info },
              confidence: {
                score: Math.min(0.95, 0.5 + score * 0.1),
                sources: [String(filePath)],
                traceable: true,
              },
            },
          });
        }
      }
    }

    // Search symbols map
    if (this.graphStore.symbols) {
      for (const [symbolId, info] of (this.graphStore.symbols as Map<string, any>)) {
        const symbolName = info?.name || String(symbolId);
        const score = computeBM25Score(queryTokens, symbolName, 1.2);
        if (score > 0) {
          scoredItems.push({
            score,
            item: {
              id: String(symbolId),
              type: this.type as any,
              content: { symbolId, ...info },
              confidence: {
                score: Math.min(0.95, 0.5 + score * 0.1),
                sources: [info?.filePath || String(symbolId)],
                traceable: true,
              },
            },
          });
        }
      }
    }

    // Sort descending by score, tie-break by ID
    scoredItems.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

    return scoredItems.slice(0, 15).map(s => s.item);
  }
}
