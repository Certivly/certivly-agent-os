/**
 * OpenApiParser resolves and extracts endpoints from OpenAPI 3.0 / 3.1 documents.
 */

import type { OpenApiDocument, OpenApiEndpointDescriptor, OpenApiOperation, OpenApiParameter } from './types';

export class OpenApiParser {
  private doc: OpenApiDocument;

  constructor(doc: OpenApiDocument) {
    this.doc = doc;
  }

  /**
   * Resolves a JSON pointer $ref within components/schemas.
   */
  public resolveRef(ref: string): any {
    if (!ref.startsWith('#/')) return undefined;
    const parts = ref.slice(2).split('/');
    let curr: any = this.doc;
    for (const part of parts) {
      if (curr === null || typeof curr !== 'object') return undefined;
      curr = curr[part];
    }
    return curr;
  }

  /**
   * Recursively dereferences an object's $ref properties.
   */
  public dereference(schema: any, depth: number = 0): any {
    if (depth > 10 || !schema || typeof schema !== 'object') return schema;

    if (schema.$ref && typeof schema.$ref === 'string') {
      const resolved = this.resolveRef(schema.$ref);
      if (resolved) {
        return this.dereference(resolved, depth + 1);
      }
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map(item => this.dereference(item, depth + 1));
    }

    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(schema)) {
      result[k] = this.dereference(v, depth + 1);
    }
    return result;
  }

  /**
   * Generates a deterministic operationId if one is not provided.
   */
  private generateOperationId(method: string, path: string): string {
    const cleanPath = path
      .replace(/\{([^}]+)\}/g, 'by_$1')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${method.toLowerCase()}_${cleanPath}`;
  }

  /**
   * Extracts all endpoints from the document.
   */
  public parseEndpoints(): OpenApiEndpointDescriptor[] {
    const endpoints: OpenApiEndpointDescriptor[] = [];
    const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

    if (!this.doc.paths) return endpoints;

    for (const [pathStr, pathItem] of Object.entries(this.doc.paths)) {
      if (!pathItem) continue;
      const commonParams: OpenApiParameter[] = Array.isArray(pathItem.parameters)
        ? pathItem.parameters.map(p => this.dereference(p))
        : [];

      for (const method of httpMethods) {
        const operation = (pathItem as any)[method] as OpenApiOperation | undefined;
        if (!operation) continue;

        const opParams: OpenApiParameter[] = Array.isArray(operation.parameters)
          ? operation.parameters.map(p => this.dereference(p))
          : [];

        // Combine path and operation parameters
        const allParams = [...commonParams, ...opParams];

        const operationId = operation.operationId || this.generateOperationId(method, pathStr);

        let requestBodySchema: any;
        if (operation.requestBody?.content) {
          const jsonContent = operation.requestBody.content['application/json'];
          if (jsonContent?.schema) {
            requestBodySchema = this.dereference(jsonContent.schema);
          }
        }

        let responseSchema: any;
        if (operation.responses) {
          const okResponse = operation.responses['200'] || operation.responses['201'] || operation.responses['default'];
          if (okResponse?.content?.['application/json']?.schema) {
            responseSchema = this.dereference(okResponse.content['application/json'].schema);
          }
        }

        endpoints.push({
          path: pathStr,
          method: method.toUpperCase(),
          operationId,
          summary: operation.summary || '',
          description: operation.description || operation.summary || '',
          parameters: allParams,
          requestBodySchema,
          responseSchema,
          tags: operation.tags || [],
        });
      }
    }

    return endpoints;
  }
}
