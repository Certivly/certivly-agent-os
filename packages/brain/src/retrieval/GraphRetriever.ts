import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';

export interface GraphStore {
  queryNodes?(query: string): Promise<any[]>;
  files?: Map<any, any>;
  symbols?: Map<any, any>;
}

export class GraphRetriever implements KnowledgeRetriever {
  public readonly type = 'graph';

  constructor(private graphStore?: GraphStore) {}

  public async retrieve(query: BrainQuery): Promise<KnowledgeItem[]> {
    if (!this.graphStore) return [];

    // Use queryNodes if available, otherwise search file/symbol maps
    if (typeof this.graphStore.queryNodes === 'function') {
      const nodes = await this.graphStore.queryNodes(query.query);
      return nodes.map(node => ({
        id: node.id || String(Math.random()),
        type: this.type as any,
        content: node,
        confidence: { score: 0.9, sources: [node.id || 'graph-node'], traceable: true }
      }));
    }

    // Fallback: keyword search over files map
    const lower = query.query.toLowerCase();
    const items: KnowledgeItem[] = [];
    if (this.graphStore.files) {
      for (const [path, info] of (this.graphStore.files as Map<string, any>)) {
        if (path.toLowerCase().includes(lower)) {
          items.push({
            id: path,
            type: this.type as any,
            content: { path, ...info },
            confidence: { score: 0.75, sources: [path], traceable: true }
          });
          if (items.length >= 10) break;
        }
      }
    }
    return items;
  }
}
