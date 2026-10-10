import type { ToolRegistry, WorkspaceTool } from '@agent-os/tools';
import type { ToolSignature, CatalogSearchResult } from '../types';
import { ToolSchemaGenerator, GeneratedTypeDefinition } from '../schema/ToolSchemaGenerator';
import { OpenApiParser } from '../openapi/OpenApiParser';
import { OpenApiToolBridge, OpenApiAuthOptions } from '../openapi/OpenApiToolBridge';
import type { OpenApiDocument } from '../openapi/types';

export class ToolCatalog {
  private tools: Map<string, WorkspaceTool> = new Map();

  constructor(toolsOrRegistry?: WorkspaceTool[] | ToolRegistry) {
    if (toolsOrRegistry) {
      if ('list' in toolsOrRegistry) {
        for (const t of toolsOrRegistry.list()) {
          this.tools.set(t.spec.name, t);
        }
      } else if (Array.isArray(toolsOrRegistry)) {
        for (const t of toolsOrRegistry) {
          this.tools.set(t.spec.name, t);
        }
      }
    }
  }

  public registerTool(tool: WorkspaceTool): void {
    this.tools.set(tool.spec.name, tool);
  }

  public removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  public clear(): void {
    this.tools.clear();
  }

  public getTool(name: string): WorkspaceTool | undefined {
    return this.tools.get(name);
  }

  public listTools(): WorkspaceTool[] {
    return Array.from(this.tools.values()).sort((a, b) =>
      a.spec.name.localeCompare(b.spec.name)
    );
  }

  /**
   * Imports all endpoints from an OpenAPI document as callable tools.
   */
  public importOpenApi(
    doc: OpenApiDocument,
    baseUrl?: string,
    auth?: OpenApiAuthOptions
  ): WorkspaceTool[] {
    const parser = new OpenApiParser(doc);
    const endpoints = parser.parseEndpoints();
    const effectiveBaseUrl = baseUrl || doc.servers?.[0]?.url || 'http://localhost';
    const importedTools: WorkspaceTool[] = [];

    for (const ep of endpoints) {
      const tool = OpenApiToolBridge.createTool(ep, effectiveBaseUrl, auth);
      this.registerTool(tool);
      importedTools.push(tool);
    }

    return importedTools;
  }

  public toSignature(tool: WorkspaceTool): ToolSignature {
    const spec = tool.spec;
    const name = spec.name;

    // Handle namespaced tools, e.g., mcp_postgres_query -> namespace: postgres, member: query
    let namespace: string | undefined;
    if (name.includes('__') || name.startsWith('mcp_')) {
      const parts = name.split(/__|(?<=^mcp)_(?=[a-z])/);
      if (parts.length > 1) {
        namespace = parts[0];
      }
    }

    const paramsObj = spec.parameters as any;
    let paramStr = 'args: Record<string, any>';

    if (paramsObj && paramsObj.properties) {
      const props = Object.entries(paramsObj.properties).map(([key, val]: [string, any]) => {
        const typeStr = ToolSchemaGenerator.jsonSchemaToType(val);
        const isReq = Array.isArray(paramsObj.required) && paramsObj.required.includes(key);
        return `${key}${isReq ? '' : '?'}: ${typeStr}`;
      });
      paramStr = `args: { ${props.join(', ')} }`;
    }

    const signature = `tools.${name}(${paramStr}): Promise<any>`;

    return {
      name,
      namespace,
      description: spec.description || '',
      readOnly: spec.readOnly ?? false,
      signature,
    };
  }

  public search(query: string, maxResults: number = 15): CatalogSearchResult {
    const q = query.toLowerCase().trim();
    const allTools = this.listTools();

    if (!q) {
      const tools = allTools.slice(0, maxResults).map(t => this.toSignature(t));
      return { query, totalMatches: allTools.length, tools };
    }

    const matches: Array<{ tool: WorkspaceTool; score: number }> = [];

    for (const tool of allTools) {
      const name = tool.spec.name.toLowerCase();
      const desc = (tool.spec.description || '').toLowerCase();
      let score = 0;

      if (name === q) score += 100;
      else if (name.startsWith(q)) score += 50;
      else if (name.includes(q)) score += 25;

      if (desc.includes(q)) score += 10;

      if (score > 0) {
        matches.push({ tool, score });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    const selected = matches.slice(0, maxResults).map(m => this.toSignature(m.tool));

    return {
      query,
      totalMatches: matches.length,
      tools: selected,
    };
  }

  /**
   * Generates ambient TypeScript definitions for all tools in the catalog.
   */
  public generateDts(): string {
    return ToolSchemaGenerator.generateCatalogDts(this.listTools());
  }

  /**
   * Returns individual generated TypeScript definitions for each tool.
   */
  public getDeclarations(): GeneratedTypeDefinition[] {
    return this.listTools().map(t => ToolSchemaGenerator.generateToolDeclaration(t));
  }

  public renderCatalogMarkdown(maxTools: number = 20): string {
    const tools = this.listTools().slice(0, maxTools);
    const lines: string[] = [
      '### CodeMode Tool Catalog',
      'The following tools can be called in your JavaScript scripts via `await tools.<name>(args)`:',
      '```typescript',
    ];

    for (const t of tools) {
      const sig = this.toSignature(t);
      lines.push(`// ${sig.description}`);
      lines.push(`${sig.signature};`);
      lines.push('');
    }

    lines.push('```');
    if (this.tools.size > maxTools) {
      lines.push(`\n*(${this.tools.size - maxTools} additional tools available via \`$codemode.search("keyword")\`)*`);
    }

    return lines.join('\n');
  }
}
