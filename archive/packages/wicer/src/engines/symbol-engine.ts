import { KnowledgeUnit } from '../models';
import { RepositoryGraphSnapshot } from '@agent-os/repository/src/models';

export class SymbolWikiEngine {
  public generate(symbolId: string, snapshot: RepositoryGraphSnapshot): KnowledgeUnit {
    const symbol = snapshot.symbols.get(symbolId);
    if (!symbol) throw new Error(`Symbol ${symbolId} not found in graph`);

    const callsOut = snapshot.calls.filter(c => c.callerSymbolId === symbolId);
    const callsIn = snapshot.calls.filter(c => c.calleeSymbolId === symbolId || c.calleeName === symbol.name);

    const content = `Symbol: ${symbol.name}

Type: ${symbol.type}

Location:
- file: ${symbol.filePath}
- lines: ${symbol.startLine} to ${symbol.endLine}

Relationships:
- Callers (Inbound):
${callsIn.length > 0 ? callsIn.map(c => `  - ${c.callerSymbolId}`).join('\n') : '  - None'}
- Outbound Calls:
${callsOut.length > 0 ? callsOut.map(c => `  - ${c.calleeName}`).join('\n') : '  - None'}

Definition:
${symbol.signature}

Trace:
- Graph Version: ${snapshot.version}
`;

    return {
      id: `symbol:${symbolId}`,
      type: 'symbol',
      title: `Symbol: ${symbol.name}`,
      content,
      sourceGraphRefs: [symbolId, symbol.filePath],
      sourceEventRefs: [],
      createdAt: Date.now(),
      version: 1
    };
  }
}
