import { ExecutionContext } from "./ExecutionContext";
import { ValidationResult, ApprovalPackage } from "./models";

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
    const patchBundle = await this.patchEngine.generatePatch(context);
    const trustReport = await this.trustRuntime.evaluateRisk(context, patchBundle);
    const impactReport = await this.wicer.generateImpactReport(context, patchBundle);

    const summary = `Execution completed with validation: ${validationResult.passed ? "Passed" : "Failed"}. Risk score: ${trustReport.riskScore}.`;

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
