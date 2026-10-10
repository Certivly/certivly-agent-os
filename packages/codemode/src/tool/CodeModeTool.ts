import type { WorkspaceTool, ToolContext, ToolResult } from '@agent-os/tools';
import { Tool } from '@agent-os/tools';
import { CodeModeInterpreter } from '../interpreter/CodeModeInterpreter';
import { ToolCatalog } from '../catalog/ToolCatalog';

export class CodeModeTool implements WorkspaceTool, Tool {
  public readonly name = 'execute';
  public readonly description =
    'Execute a sandboxed JavaScript program to orchestrate, sequence, parallelize, and filter tool operations. Call tools via await tools.<name>(args) and use $codemode.search("keyword") to discover available tools.';

  public readonly spec = {
    name: 'execute',
    description: this.description,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'Async JavaScript program to execute. Use await tools.<name>(args) to invoke tools, process data with standard JS, and return the final filtered result.',
        },
      },
      required: ['code'],
    },
    readOnly: false,
  };

  private interpreter: CodeModeInterpreter;

  constructor(private catalog: ToolCatalog) {
    this.interpreter = new CodeModeInterpreter(catalog);
  }

  public requiresApproval(): boolean {
    return false; // CodeMode internally validates tool execution permissions
  }

  public async execute(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<ToolResult & any> {
    const code = args?.code;
    if (typeof code !== 'string' || !code.trim()) {
      return {
        content: 'Error: Parameter "code" must be a non-empty JavaScript string',
        isError: true,
        success: false,
      };
    }

    const effectiveContext: ToolContext = context || { workspaceRoot: process.cwd() };
    const result = await this.interpreter.execute(code, effectiveContext);

    if (!result.ok) {
      const errMessage = `CodeMode Execution Failed [${result.error?.kind}]: ${result.error?.message}`;
      const logSection = result.logs.length > 0 ? `\nLogs:\n${result.logs.join('\n')}` : '';
      const content = `${errMessage}${logSection}`;

      return Object.assign(
        {
          content,
          isError: true,
          success: false,
          data: result,
        },
        { toString: () => content }
      );
    }

    let formattedValue: string;
    if (result.value === undefined) {
      formattedValue = 'Program executed successfully with no return value.';
    } else if (typeof result.value === 'string') {
      formattedValue = result.value;
    } else {
      formattedValue = JSON.stringify(result.value, null, 2);
    }

    const logSection = result.logs.length > 0 ? `\n\n[Console Logs]:\n${result.logs.join('\n')}` : '';
    const content = `${formattedValue}${logSection}`.trim();

    return Object.assign(
      {
        content,
        isError: false,
        success: true,
        data: result,
      },
      { toString: () => content }
    );
  }
}
