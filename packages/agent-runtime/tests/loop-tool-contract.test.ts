import { describe, it, expect } from 'bun:test';
import {
  type LoopToolSpec,
  type LoopTool,
  validateToolArguments,
  AdaptedLoopTool,
} from '../src/loop/LoopTool';

describe('Loop Tool Contract', () => {
  const fileSpec: LoopToolSpec = {
    name: 'read_file',
    description: 'Read file contents from workspace',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to file' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  };

  it('should expose the read-only flag in the spec', () => {
    expect(fileSpec.readOnly).toBe(true);

    const writeSpec: LoopToolSpec = {
      name: 'write_file',
      description: 'Write file to workspace',
      readOnly: false,
      parameters: {},
    };
    expect(writeSpec.readOnly).toBe(false);
  });

  it('should return a validation error when a required argument is missing', () => {
    const errors = validateToolArguments(fileSpec, {});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Missing required argument: 'path'");
  });

  it('should reject unknown arguments when additionalProperties: false', () => {
    const errors = validateToolArguments(fileSpec, {
      path: 'src/main.ts',
      unexpectedField: 123,
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Unknown argument 'unexpectedField'");
  });

  it('should accept valid arguments matching the spec', () => {
    const errors = validateToolArguments(fileSpec, {
      path: 'src/main.ts',
    });
    expect(errors).toEqual([]);
  });

  it('should support execution via AdaptedLoopTool', async () => {
    const mockLegacyTool = {
      name: 'echo_tool',
      description: 'Echoes message',
      execute: async (args: any) => `Echo: ${args.message}`,
    };

    const loopTool = new AdaptedLoopTool(mockLegacyTool, {
      readOnly: true,
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    });

    expect(await loopTool.requiresApproval({})).toBe(false);

    const result = await loopTool.execute({ message: 'hello' }, undefined, 'call_abc');
    expect(result.toolCallId).toBe('call_abc');
    expect(result.name).toBe('echo_tool');
    expect(result.content).toBe('Echo: hello');
    expect(result.isError).toBe(false);
  });
});
