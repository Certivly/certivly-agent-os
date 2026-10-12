# Example: Fixing a Bug with AgentOS

This walkthrough demonstrates how AgentOS diagnoses, patches, and verifies a bug in a TypeScript repository.

---

## Scenario

A service in `src/billing/discount.ts` calculates a 0% discount when a customer has exactly 10 loyalty points due to a `>=` vs `>` boundary condition.

---

## 1. Run the Agent

Execute the agent pointing to the task:

```bash
agentos "Fix discount calculation off-by-one error for 10-point customers in src/billing/discount.ts and ensure bun test passes"
```

---

## 2. Agent Execution Steps

1. **Exploration**:
   - `RepoMap` identifies `src/billing/discount.ts` and `tests/discount.test.ts`.
   - Tool `read_file` inspects the function logic and failing assertions.
2. **Planning**:
   - Creates a lightweight 2-step plan:
     1. Update discount threshold check in `src/billing/discount.ts`.
     2. Run `bun test` to confirm test suite passes.
3. **Execution**:
   - Tool `patch_file` updates `src/billing/discount.ts`.
4. **Verification**:
   - Automatically runs `bun test` in the sandbox worktree.
   - Test passes with exit code `0`.
5. **Self-Review**:
   - Inspects generated diff to ensure no unexpected changes were made.

---

## 3. Review and Apply Patch

View the diff in the terminal:

```bash
agentos patch show
```

Output:
```diff
--- a/src/billing/discount.ts
+++ b/src/billing/discount.ts
@@ -12,3 +12,3 @@
-  if (points > 10) {
+  if (points >= 10) {
     return subtotal * 0.9;
   }
```

Apply the changes to your workspace:

```bash
agentos patch apply
```
