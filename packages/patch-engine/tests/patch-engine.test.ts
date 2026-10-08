import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { ASTPatchBuilder } from "../src/ast/ASTPatchBuilder";
import { ASTPatchValidator } from "../src/ast/ASTPatchValidator";
import { PatchValidator, IConventionEngine } from "../src/patch/PatchValidator";
import { PatchExecutor } from "../src/patch/PatchExecutor";
import { PatchRollback } from "../src/patch/PatchRollback";
import { PatchStore } from "../src/store/PatchStore";
import { PatchLineageTracker } from "../src/lineage/PatchLineage";
import { PatchEngine } from "../src/patch/PatchEngine";
import { WorkspaceSnapshot } from "../src/workspace/WorkspaceSnapshot";
import { DiffGenerator } from "../src/diff/DiffGenerator";
import { PatchPlanner } from "../src/patch/PatchPlanner";

import { ParserRegistry } from "@agent-os/parser";

describe("Patch Engine Lifecycle & Determinism", () => {
  const TEST_DIR = ".agentos/patch_test_workspace";
  const TEST_FILE = path.join(TEST_DIR, "auth.ts");
  let parserRegistry: ParserRegistry;

  before(async () => {
    parserRegistry = new ParserRegistry();
    await parserRegistry.initialize();
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(TEST_FILE, "function login() {\n  return false;\n}");
  });

  after(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  test("generates, validates, applies, and rolls back patches deterministically", async () => {
    // 1. AST & Diff
    const astBuilder = new ASTPatchBuilder(parserRegistry);
    const diffGen = new DiffGenerator();
    const planner = new PatchPlanner();

    const insertOp = astBuilder.buildAstInsert(TEST_FILE, "FunctionDeclaration:login", "\n  console.log('logged');");
    
    // 2. Planning
    const patch = planner.proposePatch("goal_1", "strat_1", [insertOp], "Inject logging");
    assert.strictEqual(patch.files[0].path, TEST_FILE);

    // 3. Setup Engine
    const astValidator = new ASTPatchValidator(parserRegistry);
    const conventionEngine: IConventionEngine = { discover: () => [] };
    const validator = new PatchValidator(astValidator, conventionEngine);
    const executor = new PatchExecutor();
    const rollback = new PatchRollback(new Map());
    const store = new PatchStore(TEST_DIR);
    const lineage = new PatchLineageTracker();
    
    const engine = new PatchEngine(validator, executor, rollback, store, lineage);

    // 4. Validate Bad AST (unmatched brace)
    const badPatch = planner.proposePatch("goal_1", "strat_1", [
      astBuilder.buildAstInsert(TEST_FILE, "FunctionDeclaration:login", "{\n")
    ], "Bad patch");
    
    const badResult = validator.validate(badPatch);
    assert.strictEqual(badResult.valid, false);
    assert.ok(badResult.reason?.includes("AST Syntax Validation Failed"));

    // 5. Apply Good Patch
    const originalContent = fs.readFileSync(TEST_FILE, "utf-8");
    const result = await engine.apply(patch);
    
    if (!result.success) console.error(result.reason);
    assert.strictEqual(result.success, true, result.reason);
    const newContent = fs.readFileSync(TEST_FILE, "utf-8");
    assert.ok(newContent.includes("console.log('logged');"));

    // Diff generation works
    const diff = diffGen.generateUnifiedDiff(originalContent, newContent, "auth.ts");
    assert.ok(diff.includes("\n+   console.log('logged');"));

    // Lineage tracked
    const trace = lineage.trace(patch.id);
    assert.strictEqual(trace?.goalId, "goal_1");

    // 6. Rollback
    const rollbackSuccess = await engine.rollback(patch.id);
    assert.strictEqual(rollbackSuccess, true);

    const revertedContent = fs.readFileSync(TEST_FILE, "utf-8");
    assert.strictEqual(revertedContent, originalContent);
  });
});
