import * as fs from "fs";
import { Patch } from "../models/Patch";
import { ASTPatchValidator } from "../ast/ASTPatchValidator";
export interface IConventionEngine {
  discover(files: string[]): Array<{ pattern: string; evidenceCount?: number }>;
}

export class PatchValidator {
  constructor(
    private astValidator: ASTPatchValidator,
    private conventionEngine: IConventionEngine
  ) {}

  public validate(patch: Patch): { valid: boolean; reason?: string } {
    for (const op of patch.operations) {
      // Stage 1 & 2: Existence and Path
      if (op.type === "MODIFY_FILE" && !fs.existsSync(op.targetPath)) {
        return { valid: false, reason: `File does not exist: ${op.targetPath}` };
      }

      // Stage 3 & 4: AST and Syntax validation
      if (op.type === "AST_INSERT" || op.type === "REPLACE_TEXT") {
        // Simple heuristic: just validate payload itself or a small wrap. 
        // Real AST parsing needs full context but we validate the snippet here as a proxy.
        if (op.payload && !this.astValidator.validate(op.payload, op.targetPath)) {
          return { valid: false, reason: `AST Syntax Validation Failed for payload: ${op.payload}` };
        }
      }
    }

    // Stage 6: Convention Validation
    const affectedFiles = patch.files.map(f => f.path);
    const conventions = this.conventionEngine.discover(affectedFiles);
    
    // Deterministic mock rule enforcement based on brain discovery
    for (const convention of conventions) {
      if (convention.pattern === "PascalCase for Components") {
        const hasBadName = affectedFiles.some(f => f.endsWith(".tsx") && !/^[A-Z]/.test(f.split('/').pop()!));
        if (hasBadName) {
          return { valid: false, reason: `Convention Violation: ${convention.pattern}` };
        }
      }
    }

    return { valid: true };
  }
}
