import { Tool } from '../interface';
import { JsonObject, ToolError } from '@agent-os/shared';
import * as fs from 'fs/promises';
import * as path from 'path';
import { workspaceManager } from '../workspace';

async function searchDir(dir: string, query: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results.push(...(await searchDir(fullPath, query)));
      }
    } else {
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        if (content.includes(query)) {
          results.push(fullPath);
        }
      } catch (e) {
        // ignore non-utf8 or unreadable files
      }
    }
  }
  return results;
}

export const searchFilesTool: Tool = {
  name: 'search_files',
  description: 'Search for a string in files within a directory',
  execute: async (args: JsonObject) => {
    const { path: dirPath, query } = args;
    if (typeof dirPath !== 'string') throw new ToolError('Path must be a string');
    if (typeof query !== 'string') throw new ToolError('Query must be a string');
    try {
      const targetPath = workspaceManager.resolvePath(dirPath);
      const matches = await searchDir(targetPath, query);
      return JSON.stringify(matches);
    } catch (e: any) {
      if (e.message.includes('Security Violation')) throw new ToolError(e.message);
      throw new ToolError(`Failed to search files in ${dirPath}: ${e.message}`);
    }
  }
};
