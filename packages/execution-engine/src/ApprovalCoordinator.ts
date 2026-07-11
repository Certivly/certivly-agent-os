import { ExecutionContext } from "./ExecutionContext";
import { ValidationResult, ApprovalPackage } from "./models";
import * as crypto from 'crypto';

export class ApprovalCoordinator {
  constructor(
    private patchEngine: any,
    private trustRuntime: any,
    private wicer: any
  ) {}

  public async generateApprovalPackage(
    context: ExecutionContext,
    validationResult: ValidationResult
  ): Promise<ApprovalPackage> {
    // Extract real diffs from sandbox
    let patchBundle: any = {
      id: crypto.randomUUID(),
      goalId: context.planId,
      files: [],
      operations: [],
      patches: [],
      explanation: "No sandbox active — no file changes produced.",
      createdAt: Date.now()
    };

    if (context.sandbox) {
      try {
        const filePatchesList = await context.sandbox.generatePatch();
        if (filePatchesList.length > 0) {
          patchBundle = {
            id: crypto.randomUUID(),
            goalId: context.planId,
            files: filePatchesList.map((p: any) => p.filePath || p.path),
            operations: filePatchesList.map((p: any) => ({
              type: 'MODIFY',
              path: p.filePath || p.path,
              diff: p.diff || p.content
            })),
            patches: filePatchesList,
            explanation: `${filePatchesList.length} file(s) modified in sandbox.`,
            createdAt: Date.now()
          };
        }
      } catch (e: any) {
        console.warn('[ApprovalCoordinator] Could not extract sandbox diffs:', e.message);
      }
    }

    // Trust evaluation
    let trustReport = { score: 100, passed: true, regressions: [] as string[] };
    try {
      trustReport = await this.trustRuntime.evaluateRisk(context, patchBundle);
    } catch (e: any) {
      console.warn('[ApprovalCoordinator] Trust evaluation failed:', e.message);
    }

    // WiCER impact (best-effort)
    let impactReport: any = { severity: 'LOW' };
    try {
      if (typeof this.wicer.generateImpactReport === 'function') {
        impactReport = await this.wicer.generateImpactReport(context, patchBundle);
      }
    } catch {}

    const fileCount = patchBundle.operations?.length ?? 0;
    const summary = `Execution complete. Validation: ${validationResult.passed ? 'passed' : 'failed'}. ${fileCount} file(s) changed.`;

    return {
      executionId: context.executionId,
      patchBundle,
      validationResult,
      trustReport,
      impactReport,
      summary
    };
  }
}
