export interface ParsedInput {
  isCommand: boolean;
  raw: string;
  command?: string;
  args?: Record<string, string | number | boolean>;
  positional?: string[];
}

export class InputParser {
  /**
   * Parses raw string input into a structured object.
   * If it starts with '/', it's treated as a command.
   * Example: /trace session=abc123 depth=5
   */
  public static parse(input: string): ParsedInput {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return { isCommand: false, raw: trimmed };
    }

    // It's a command
    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0];
    const rawArgs = parts.slice(1);

    const args: Record<string, string | number | boolean> = {};
    const positional: string[] = [];

    for (const arg of rawArgs) {
      if (arg.includes('=')) {
        const [key, ...valueParts] = arg.split('=');
        const value = valueParts.join('='); // in case value contains '='
        
        // rudimentary type casting
        if (value === 'true') args[key] = true;
        else if (value === 'false') args[key] = false;
        else if (!isNaN(Number(value))) args[key] = Number(value);
        else args[key] = value;
      } else {
        positional.push(arg);
      }
    }

    return {
      isCommand: true,
      raw: trimmed,
      command,
      args,
      positional
    };
  }
}
