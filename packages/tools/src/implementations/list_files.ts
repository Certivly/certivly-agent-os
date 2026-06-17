import { Tool } from '../interface';
import { JsonObject, ToolError } from '@agent-os/shared';
import * as fs from 'fs/promises';
import { workspaceManager } from '../workspace';

export const listFilesTool: Tool = {
  name: 'list_files',
  description: 'List files in a directory',
  execute: async (args: JsonObject) => {
    const { path } = args;
    if (typeof path !== 'string') throw new ToolError('Path must be a string');
    try {
      const targetPath = workspaceManager.resolvePath(path);
      const files = await fs.readdir(targetPath);
      return JSON.stringify(files);
    } catch (e: any) {
      if (e.message.includes('Security Violation')) throw new ToolError(e.message);
      throw new ToolError(`Failed to list files in ${path}: ${e.message}`);
    }
  }
};
