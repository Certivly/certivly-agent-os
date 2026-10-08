import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeStore } from '../store';
import { metrics } from '@agent-os/metrics';
import { EventStore } from '@agent-os/events';

export class WikiCompiler {
  constructor(
    private store: KnowledgeStore,
    private eventStore: EventStore,
    private outputDir: string = path.join(process.cwd(), '.agentos', 'docs')
  ) {}

  public compileAll() {
    const startMs = performance.now();
    
    // Ensure directories exist
    const dirs = ['file', 'symbol', 'module', 'system'];
    for (const dir of dirs) {
      const fullPath = path.join(this.outputDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }

    const units = this.store.query({});
    let count = 0;

    for (const unit of units) {
      const typeDir = path.join(this.outputDir, unit.type);
      
      // Sanitize ID for filename
      const safeFilename = unit.id.replace(/[^a-zA-Z0-9.\-_]/g, '_') + '.md';
      const filepath = path.join(typeDir, safeFilename);

      const header = `---
id: ${unit.id}
title: ${unit.title}
type: ${unit.type}
version: ${unit.version}
created_at: ${unit.createdAt}
---

`;
      fs.writeFileSync(filepath, header + unit.content);
      count++;
    }

    const duration = performance.now() - startMs;
    // @ts-ignore
    if (metrics.histogram) metrics.histogram('wiki_generation_time').observe(duration);
    
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'wicer.wiki.generated',
      timestamp: new Date().toISOString(),
      requestId: 'internal',
      sessionId: 'internal',
      source: 'wicer',
      payload: { outputDir: this.outputDir, unitsCompiled: count },
      version: "1.0"
    });
  }
}
