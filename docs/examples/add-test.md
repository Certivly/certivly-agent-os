# Example: Adding Unit Tests with AgentOS

This walkthrough demonstrates using AgentOS to add unit test coverage for an existing module.

---

## Scenario

We have an authentication utility in `src/auth/jwt.ts` that validates tokens, but lacks tests for expired tokens and malformed signatures.

---

## 1. Run the Agent

```bash
agentos "Add comprehensive unit tests for expired tokens and malformed signatures in tests/auth/jwt.test.ts"
```

---

## 2. Agent Execution Steps

1. **Inspection**:
   - Agent reads `src/auth/jwt.ts` and inspects existing test utilities.
2. **Implementation**:
   - Agent writes new test cases in `tests/auth/jwt.test.ts`.
3. **Sandbox Verification**:
   - Agent executes `bun test tests/auth/jwt.test.ts` inside the sandbox worktree.
   - If a test assertion is incorrect or mocks are missing, the agent reviews compiler output and adjusts the test.
4. **Completion**:
   - Verification succeeds.
   - The user is notified that the new tests pass cleanly.

---

## 3. Review Changes

```bash
agentos patch show
```

The patch is confirmed safe and can be applied or saved to a git branch.
