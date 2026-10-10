/**
 * OpenApiToolBridge bridges OpenAPI endpoints into callable WorkspaceTools.
 */

import type { WorkspaceTool, ToolContext, ToolResult } from '@agent-os/tools';
import type { OpenApiEndpointDescriptor } from './types';

export interface OpenApiAuthOptions {
  bearerToken?: string;
  apiKey?: {
    name: string;
    value: string;
    in: 'header' | 'query';
  };
  headers?: Record<string, string>;
}

export class OpenApiToolBridge {
  /**
   * Builds parameter JSON schema for an OpenAPI endpoint.
   */
  public static buildParameterSchema(endpoint: OpenApiEndpointDescriptor): Record<string, any> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Path & Query parameters
    for (const param of endpoint.parameters) {
      const propSchema = param.schema ? { ...param.schema } : { type: 'string' };
      if (param.description) {
        propSchema.description = param.description;
      }
      properties[param.name] = propSchema;
      if (param.required || param.in === 'path') {
        required.push(param.name);
      }
    }

    // Request body properties
    if (endpoint.requestBodySchema) {
      if (endpoint.requestBodySchema.type === 'object' && endpoint.requestBodySchema.properties) {
        for (const [key, val] of Object.entries(endpoint.requestBodySchema.properties)) {
          properties[key] = val;
        }
        if (Array.isArray(endpoint.requestBodySchema.required)) {
          required.push(...endpoint.requestBodySchema.required);
        }
      } else {
        properties['body'] = endpoint.requestBodySchema;
        required.push('body');
      }
    }

    return {
      type: 'object',
      properties,
      required: Array.from(new Set(required)),
    };
  }

  /**
   * Creates a WorkspaceTool from an endpoint descriptor.
   */
  public static createTool(
    endpoint: OpenApiEndpointDescriptor,
    baseUrl: string,
    auth?: OpenApiAuthOptions,
    fetchFn: typeof fetch = globalThis.fetch
  ): WorkspaceTool {
    const parameters = this.buildParameterSchema(endpoint);
    const toolName = endpoint.operationId.replace(/[^a-zA-Z0-9_]/g, '_');
    const readOnly = endpoint.method === 'GET' || endpoint.method === 'HEAD';

    const tool: WorkspaceTool = {
      spec: {
        name: toolName,
        description: `[${endpoint.method} ${endpoint.path}] ${endpoint.description || endpoint.summary || toolName}`,
        parameters,
        readOnly,
      },
      execute: async (args: Record<string, unknown>, _context?: ToolContext): Promise<ToolResult> => {
        try {
          let resolvedPath = endpoint.path;
          const queryParams = new URLSearchParams();
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(auth?.headers || {}),
          };

          if (auth?.bearerToken) {
            headers['Authorization'] = `Bearer ${auth.bearerToken}`;
          }
          if (auth?.apiKey && auth.apiKey.in === 'header') {
            headers[auth.apiKey.name] = auth.apiKey.value;
          }
          if (auth?.apiKey && auth.apiKey.in === 'query') {
            queryParams.set(auth.apiKey.name, auth.apiKey.value);
          }

          // Handle path and query arguments
          const bodyData: Record<string, unknown> = {};

          for (const [key, val] of Object.entries(args)) {
            const param = endpoint.parameters.find(p => p.name === key);
            if (param) {
              if (param.in === 'path') {
                resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(String(val)));
              } else if (param.in === 'query') {
                if (val !== undefined && val !== null) {
                  queryParams.set(key, String(val));
                }
              } else if (param.in === 'header') {
                if (val !== undefined && val !== null) {
                  headers[param.name] = String(val);
                }
              }
            } else if (key === 'body') {
              Object.assign(bodyData, typeof val === 'object' && val !== null ? val : { value: val });
            } else {
              bodyData[key] = val;
            }
          }

          const cleanBase = baseUrl.replace(/\/+$/, '');
          const cleanPath = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;
          const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
          const targetUrl = `${cleanBase}${cleanPath}${queryString}`;

          const requestInit: RequestInit = {
            method: endpoint.method,
            headers,
          };

          if (endpoint.method !== 'GET' && endpoint.method !== 'HEAD') {
            requestInit.body = JSON.stringify(bodyData);
          }

          const response = await fetchFn(targetUrl, requestInit);
          const responseText = await response.text();

          let parsedData: any = responseText;
          try {
            parsedData = JSON.parse(responseText);
          } catch (_e: unknown) {
            // Keep responseText if not JSON
          }

          if (!response.ok) {
            return {
              content: `HTTP ${response.status} ${response.statusText}: ${responseText}`,
              isError: true,
              success: false,
              data: parsedData,
            };
          }

          return {
            content: typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData, null, 2),
            isError: false,
            success: true,
            data: parsedData,
          };
        } catch (err: any) {
          return {
            content: `Failed to execute OpenAPI tool "${toolName}": ${err?.message || String(err)}`,
            isError: true,
            success: false,
          };
        }
      },
    };

    return tool;
  }
}
