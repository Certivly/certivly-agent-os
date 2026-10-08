/**
 * ARCHIVED PACKAGE: @agent-os/trust-runtime
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Replaced by truthful Verification.ts
 *
 * Revival condition: Claim contradiction benchmark improving confidence scoring
 *
 * To revive: move this directory back to packages/trust-runtime/, add it to the
 * root package.json workspaces array, run `bun install`, and wire it into
 * the live path.
 */

export * from "./src/trust/TrustEngine";
export * from "./src/trust/TrustModels";
export * from "./src/trust/TrustScoreCalculator";
export * from "./src/claims/ClaimEngine";
export * from "./src/claims/ClaimModels";
export * from "./src/claims/ClaimRegistry";
export * from "./src/claims/ClaimValidator";
export * from "./src/evidence/EvidenceTypes";
export * from "./src/evidence/EvidenceStore";
export * from "./src/evidence/EvidenceCollector";
export * from "./src/evidence/EvidenceLinker";
export * from "./src/regression/RegressionReport";
export * from "./src/verification/VerificationEngine";
export * from "./src/contradictions/ContradictionDetector";
