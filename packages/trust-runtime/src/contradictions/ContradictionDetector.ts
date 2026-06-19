import { Claim } from "../claims/ClaimModels";
import { Evidence } from "../evidence/EvidenceTypes";
import { Contradiction } from "./ContradictionModels";

export class ContradictionDetector {
  public detect(claim: Claim, evidenceList: Evidence[]): Contradiction[] {
    const contradictions: Contradiction[] = [];

    if (claim.source === "TestAgent") {
      const testEv = evidenceList.find(e => e.type === "test");
      if (testEv) {
        const testsPassed = testEv.payload?.data?.failed === 0;
        if (claim.statement === "Tests passing" && !testsPassed) {
          contradictions.push({
            id: `contra_${Date.now()}`,
            claimId: claim.id,
            evidenceId: testEv.id,
            severity: "critical",
            description: "Agent claimed tests passed, but evidence shows failed tests exist."
          });
        }
      }
    }

    if (claim.source === "BuildAgent") {
      const buildEv = evidenceList.find(e => e.type === "build");
      if (buildEv) {
        const buildPassed = buildEv.payload?.data?.passed === true;
        if (claim.statement === "Build successful" && !buildPassed) {
          contradictions.push({
            id: `contra_${Date.now()}`,
            claimId: claim.id,
            evidenceId: buildEv.id,
            severity: "critical",
            description: "Agent claimed build successful, but evidence shows build failed."
          });
        }
      }
    }

    return contradictions;
  }
}
