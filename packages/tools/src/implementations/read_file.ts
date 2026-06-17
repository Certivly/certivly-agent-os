import { Tool } from '../interface';
import { JsonObject, ToolError } from '@agent-os/shared';
import * as fs from 'fs/promises';
import { workspaceManager } from '../workspace';

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file',
  execute: async (args: JsonObject) => {
    const { path } = args;
    if (typeof path !== 'string') throw new ToolError('Path must be a string');
    try {
      const targetPath = workspaceManager.resolvePath(path);
      return await fs.readFile(targetPath, 'utf8');
    } catch (e: any) {
      if (e.message.includes('Security Violation')) throw new ToolError(e.message);
      throw new ToolError(`Failed to read file ${path}: ${e.message}`);
    }
  }
};
