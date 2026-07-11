import { ParsedInput } from './InputParser';
import { CliRuntime } from './CliRuntime';

export interface CommandContext {
  runtime: CliRuntime;
}

export interface CliCommand {
  name: string;
  description: string;
  execute(parsed: ParsedInput, context: CommandContext): Promise<void>;
}

export class CommandRouter {
  private commands = new Map<string, CliCommand>();

  public register(command: CliCommand) {
    this.commands.set(command.name, command);
  }

  public async route(parsed: ParsedInput, context: CommandContext): Promise<void> {
    if (!parsed.isCommand || !parsed.command) {
      throw new Error('Not a valid command.');
    }

    const commandHandler = this.commands.get(parsed.command);
    if (!commandHandler) {
      throw new Error(`Unknown command: /${parsed.command}`);
    }

    context.runtime.stateManager.setLastCommand(parsed.raw);

    try {
      await commandHandler.execute(parsed, context);
    } catch (e: any) {
      // Errors should ideally be emitted as events to EventStore
      console.error(e); // fallback if EventStore is not ready for system errors
    }
  }

  public getRegisteredCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  public async promptUser(message: string): Promise<boolean> {
    // In a full implementation, this would pause the Ink event loop and await stdin input.
    // For now, we simulate an automatic approval or rejection based on context,
    // or log the prompt to the console.
    console.log(`[MCP Governance] PROMPT: ${message}`);
    console.log(`[MCP Governance] Auto-approving for current CLI iteration.`);
    return true; // Simulate ALLOW
  }
}
