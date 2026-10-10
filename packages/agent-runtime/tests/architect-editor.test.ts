import { describe, it, expect } from 'bun:test';
import { ArchitectEditorPipeline } from '../src/planning/ArchitectEditorPipeline';
import { ToolRegistry } from '@agent-os/tools';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('ArchitectEditorPipeline (Aider Dual-Model Pairing Architecture)', () => {
  it('1. coordinates Architect reasoning and Editor surgical execution', async () => {
    const architectModel = new ScriptedModel([
      {
        text: 'Architect analysis: Modify file: src/math.ts to add divide(a, b) with zero-division error handling.',
      },
    ]);

    const editorModel = new ScriptedModel([
      {
        text: 'Editor: Applying surgical edit to src/math.ts',
        toolCalls: [
          {
            id: 'call-edit-math',
            name: 'edit_file',
            args: { path: 'src/math.ts', oldText: 'export function add() {}', newText: 'export function add() {}\nexport function divide() {}' },
          },
        ],
      },
    ]);

    const toolReg = new ToolRegistry();
    let edited = false;
    toolReg.register({
      spec: { name: 'edit_file', description: 'edit', parameters: {}, readOnly: false },
      requiresApproval: () => false,
      execute: async () => {
        edited = true;
        return { content: 'File edited', isError: false };
      },
    });

    const pipeline = new ArchitectEditorPipeline(architectModel, editorModel, toolReg);
    const result = await pipeline.runDualModel('Add division function');

    expect(result.success).toBe(true);
    expect(result.totalTurns).toBe(2);
    expect(result.architectSpec.filesToEdit).toContain('src/math.ts');
    expect(result.filesModified).toContain('src/math.ts');
    expect(edited).toBe(true);
  });
});
