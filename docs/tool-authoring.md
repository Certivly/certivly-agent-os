# Tool Authoring Guide

This guide describes how to author new tools for AgentOS, specify input schemas, define approval policies, enforce path security, and write tool test suites.

---

## 1. Tool Structure and Schema

Every tool in AgentOS implements the `Tool` interface from `@agent-os/tools`:

```typescript
import { z } from 'zod';
import type { Tool, ToolExecutionContext, ToolResult } from '@agent-os/tools';

export const MyToolInputSchema = z.object({
  targetPath: z.string().describe('Relative path to target file within workspace'),
  options: z.record(z.any()).optional().describe('Optional configuration parameters'),
});

export type MyToolInput = z.infer<typeof MyToolInputSchema>;

export class MyTool implements Tool<MyToolInput> {
  public readonly name = 'my_tool';
  public readonly description = 'Performs a safe workspace operation.';
  public readonly schema = MyToolInputSchema;

  public async execute(input: MyToolInput, context: ToolExecutionContext): Promise<ToolResult> {
    // Execution logic
    return {
      success: true,
      output: 'Operation completed successfully.',
    };
  }
}
```

---

## 2. Approval Policy

Tools are categorized by risk level in `packages/tools/src/policy.ts`:

- **Read-Only Tools (`read_file`, `list_dir`, `grep_files`, `get_repo_outline`)**: Automatically permitted without prompt unless operating outside workspace.
- **Workspace-Write Tools (`edit_file`, `write_file`, `patch_file`)**: Allowed inside the sandbox worktree; applied to the user's workspace only after completion or explicit user confirmation.
- **System Command Tools (`run_command`)**:
  - Safe inspection commands (`git status`, `git diff`, `npm test`, `bun test`, `tsc`) run automatically.
  - Dangerous commands (package installation, network downloads like `curl`/`wget`, destructive Git commands like `git push --force` or `git reset --hard`) require explicit approval warnings.

To register a tool approval rule:

```typescript
export function requiresApproval(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName === 'run_command') {
    const cmd = String(args.command ?? '');
    return isDestructiveCommand(cmd) || isNetworkDownloadCommand(cmd);
  }
  return false;
}
```

---

## 3. Path Safety & Containment

All filesystem tools MUST resolve paths via `WorkspaceManager` (`packages/tools/src/workspace.ts`):

- **Path Traversal Protection**: Rejects `../`, absolute drives (`C:\`, `/etc`), and null bytes (`\0`).
- **Dangerous Scheme Protection**: Rejects URL schemes (`file://`, `http://`, `data:`).
- **UNC and Device Protection**: Rejects `\\server\share`, `\\?\`, `CON`, `PRN`, `NUL`.
- **Git Metadata Protection**: Access to `.git/` internal objects is strictly prohibited.

Example safe path resolution:

```typescript
const safePath = context.workspaceManager.resolvePath(input.targetPath);
```

---

## 4. Required Tests

Every tool added to `@agent-os/tools` must include:

1. **Schema Validation Test**: Verifies invalid inputs are rejected with descriptive Zod errors.
2. **Happy Path Test**: Executes expected operation inside a mock or temporary directory.
3. **Boundary / Path Traversal Test**: Asserts attempts to escape the workspace root throw security violations.
4. **Command Injection / Error Handling Test**: Confirms failures return structured `{ success: false, error: ... }` rather than unhandled promise rejections.
