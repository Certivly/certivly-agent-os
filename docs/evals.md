# Evaluation Harness & Benchmarks

AgentOS contains an automated evaluation harness in `packages/evals` and task fixtures in `evals/tasks/` to rigorously benchmark coding agents against real bugs and test suites.

---

## 1. Task Fixture Structure

Every evaluation task resides in its own directory under `evals/tasks/<task-name>/`:

```text
evals/tasks/ts-off-by-one/
  ├── meta.json         # Task metadata (id, language, tags, difficulty)
  ├── prompt.md         # Exact prompt given to the agent
  ├── expected_patch.diff # Canonical reference fix
  └── workspace/        # Self-contained fixture repository
      ├── package.json
      ├── tsconfig.json
      ├── src/
      │   └── index.ts  # Buggy code
      └── tests/
          └── index.test.ts # Failing test verifying the bug
```

### `meta.json` Format

```json
{
  "id": "ts-off-by-one",
  "name": "Fix TypeScript Off-By-One Array Index Bug",
  "category": "bugfix",
  "language": "typescript",
  "verificationCommand": "bun test",
  "expectedFiles": ["src/index.ts"],
  "timeoutMs": 60000
}
```

---

## 2. Verification Loop

The eval runner executes the following lifecycle for each task:

1. **Isolation**: Copies the `workspace/` fixture to a temporary sandboxed Git directory.
2. **Pre-check**: Runs the verification command (`bun test`) to confirm tests fail on the unmodified buggy code.
3. **Agent Turn**: Invokes `AgentRuntime.run()` with the prompt from `prompt.md`.
4. **Post-check**: Runs verification inside the sandbox. A task passes if and only if:
   - The test command exits with code `0`.
   - The modified files match or resolve the target issue without introducing regressions.
5. **Report Generation**: Emits structured JSONL and Markdown results summarizing pass rate, cost, wall time, and token usage.

---

## 3. Adding a New Evaluation Task

To add a new task:

1. Create directory `evals/tasks/<your-task-id>`.
2. Add `meta.json` with task identifier and verification command.
3. Add `prompt.md` with instructions a human developer would give the agent.
4. Add `workspace/` containing a minimal, reproducible code tree where tests initially fail.
5. Verify your task with the scripted runner:
   ```bash
   agent eval --task <your-task-id> --model fake:scripted
   ```

---

## 4. Regression Policy & Gates

- **Zero Regression Rule**: No code change may reduce pass rates on existing evaluation tasks.
- **Smoke Gate**: `bun run gate:smoke` runs the smoke test suite and must pass 100% on every release or pull request.
- **Compare Mode**: Use `agent eval compare` to measure candidate models against established baselines:
   ```bash
   agent eval compare --baseline evals/results/baseline.jsonl --candidate evals/results/candidate.jsonl
   ```
