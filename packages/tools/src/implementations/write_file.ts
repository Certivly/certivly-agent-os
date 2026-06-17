import * as fs from 'fs';
import * as path from 'path';
import { Tool } from '../interface';
import { ToolError } from '@agent-os/shared';
import { workspaceManager } from '../workspace';
import { JsonObject } from '@agent-os/shared';

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Write content to a file',
  execute: async (args: JsonObject) => {
    const { path: filePath, content } = args;
    if (typeof filePath !== 'string') throw new ToolError('Path must be a string');
    if (typeof content !== 'string') throw new ToolError('Content must be a string');
    try {
      const targetPath = workspaceManager.resolvePath(filePath);
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    } catch (e: any) {
      if (e.message.includes('Security Violation')) throw new ToolError(e.message);
      throw new ToolError(`Failed to write file ${filePath}: ${e.message}`);
    }
  }
};
