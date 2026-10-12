# Troubleshooting Guide

This guide covers common issues encountered when using, configuring, or evaluating AgentOS.

---

## 1. Provider Authentication Failures

### Symptom
`AuthenticationError: 401 Unauthorized` or `Invalid API key`.

### Resolution
1. Verify credentials using the CLI auth status command:
   ```bash
   agentos auth status
   ```
2. Set credentials securely:
   ```bash
   agentos auth set anthropic --key sk-ant-...
   agentos auth set openai --key sk-...
   ```
3. Or verify shell environment variables:
   ```bash
   echo $ANTHROPIC_API_KEY
   echo $OPENAI_API_KEY
   ```
4. Run the diagnostic doctor probe:
   ```bash
   agentos doctor providers --probe
   ```

---

## 2. Sandbox Cleanup & Orphaned Worktrees

### Symptom
`fatal: 'agentos-worktree-...' already exists` or disk space warnings in `.agentos/worktrees`.

### Resolution
Sandboxes automatically clean up on normal process exit. If a hard system crash occurs:
1. List active git worktrees:
   ```bash
   git worktree list
   ```
2. Prune obsolete worktree references:
   ```bash
   git worktree prune
   ```
3. Remove orphaned temporary worktree directories:
   ```bash
   rm -rf .agentos/worktrees/*
   ```

---

## 3. Evaluation Benchmark Failures

### Symptom
`agentos eval --task <task-id>` fails verification or reports non-zero exit code.

### Resolution
1. Inspect the detailed run trace in `.agentos/traces/`:
   ```bash
   agentos trace show <run-id>
   ```
2. Check the test output generated inside the sandbox:
   ```bash
   cat .agentos/traces/<run-id>.jsonl | grep "verification"
   ```
3. Verify the task environment has prerequisites installed (e.g., Python 3 for Python tasks, Bun for TypeScript tasks).
4. Run the baseline scripted runner to verify harness correctness:
   ```bash
   agentos eval --task smoke --model fake:scripted
   ```

---

## 4. Patch Application Conflicts

### Symptom
`PatchConflictError: Target file content hash does not match pre-image SHA-256`.

### Resolution
AgentOS enforces atomic patch safety. If files were modified externally during an active agent session:
1. Review the generated patch file:
   ```bash
   agentos patch show
   ```
2. Discard uncommitted external edits or save the patch to a separate branch:
   ```bash
   agentos patch save ./my-fix.patch
   git apply --reject ./my-fix.patch
   ```

---

## 5. Tool Schema Validation Errors

### Symptom
`ToolExecutionError: Expected string, received null at input.path`.

### Resolution
1. Local models occasionally return arguments that violate strict Zod schemas.
2. Ensure the local model prompt includes JSON schema definitions or upgrade to a fine-tuned tool-calling model (such as `Qwen2.5-Coder-7B`).
3. Start with `--self-review` to allow AgentOS to self-correct invalid tool parameters during the execution turn.

---

## 6. Desktop Application Port Conflicts

### Symptom
`Error: listen EADDRINUSE: address already in use 127.0.0.1:3456`.

### Resolution
1. Specify an alternative port:
   ```bash
   agentos desktop --port 4567
   ```
2. Check running processes on port 3456:
   ```bash
   # On macOS / Linux
   lsof -i :3456
   # On Windows
   netstat -ano | findstr :3456
   ```
