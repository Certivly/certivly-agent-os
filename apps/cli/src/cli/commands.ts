import { CliCommand, CommandContext } from './CommandRouter';
import { ParsedInput } from './InputParser';

export const ChatCommand: CliCommand = {
  name: 'chat',
  description: 'Natural language chat',
  async execute(parsed: ParsedInput, context: CommandContext) {
    const sessionId = context.runtime.stateManager.getState.sessionId;
    const rawJson = await context.runtime.agentRuntime.handleRequest(sessionId, parsed.raw);
    try {
      const parsedOutput = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      if (parsedOutput.executionResult) {
        // We let the UI components handle the rendering using the event stream.
        // We just intercept it here in case we need to log it or emit a custom narrative event.
        context.runtime.agentRuntime.getEventBus().publish('narrative.cli.output', {
          sessionId,
          summary: parsedOutput.summary || "Execution completed."
        });
      }
    } catch (e) {
      // Not JSON, ignore
    }
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
