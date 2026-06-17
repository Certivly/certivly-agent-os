import { CliCommand, CommandContext } from './CommandRouter';
import { ParsedInput } from './InputParser';

export const ChatCommand: CliCommand = {
  name: 'chat',
  description: 'Natural language chat',
  async execute(parsed: ParsedInput, context: CommandContext) {
    const sessionId = context.runtime.stateManager.getState.sessionId;
    await context.runtime.agentRuntime.handleRequest(sessionId, parsed.raw);
  }
};

export const RunCommand: CliCommand = {
  name: 'run',
  description: 'Execute a skill or tool manually',
  async execute(parsed: ParsedInput, context: CommandContext) {
    const target = parsed.positional?.[0];
    if (target) {
       // Fire a system event or handle directly
    }
  }
};
// Replay, Trace, etc., can be added here
