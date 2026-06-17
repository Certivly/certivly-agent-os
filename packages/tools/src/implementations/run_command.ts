import { exec } from 'child_process';
import { Tool } from '../interface';
import { ToolError } from '@agent-os/shared';
import { commandPolicyEngine } from '../policy';
import { JsonObject } from '@agent-os/shared';

export const runCommandTool: Tool = {
  name: 'run_command',
  description: 'Run a shell command',
  execute: async (args: JsonObject) => {
    const { command } = args;
    if (typeof command !== 'string') throw new ToolError('Command must be a string');

    const decision = await commandPolicyEngine.evaluate(command);
    if (!decision.allowed) {
      throw new ToolError(`Command execution blocked by policy: ${decision.reason || 'Approval required'}`);
    }

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new ToolError(`Command failed: ${error.message}\n${stderr}`));
        } else {
          resolve(stdout || stderr || 'Command executed successfully with no output.');
        }
      });
    });
  }
};
