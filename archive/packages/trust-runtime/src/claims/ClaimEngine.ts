import { Claim } from "./ClaimModels";

export class ClaimEngine {
  public extractClaims(agentResult: any): Claim[] {
    const claims: Claim[] = [];
    
    // In a real system, this would parse the agent's complex output
    // For now, we mock statement extraction based on agent type
    
    if (agentResult.agentId === "patch-agent") {
      claims.push({
        id: `claim_${Date.now()}_patch`,
        statement: "Files were successfully modified to fix the issue",
        source: "PatchAgent",
        status: "unverified",
        payload: agentResult
      });
    }
    
    if (agentResult.agentId === "test-agent") {
      const testsPassed = agentResult.data?.failed === 0;
      claims.push({
        id: `claim_${Date.now()}_test`,
        statement: testsPassed ? "Tests passing" : "Failed tests exist",
        source: "TestAgent",
        status: "unverified",
        payload: agentResult
      });
    }

    if (agentResult.agentId === "build-agent") {
      const buildPassed = agentResult.data?.passed === true;
      claims.push({
        id: `claim_${Date.now()}_build`,
        statement: buildPassed ? "Build successful" : "Build failed",
        source: "BuildAgent",
        status: "unverified",
        payload: agentResult
      });
    }

    if (agentResult.agentId === "validation-agent") {
      const valid = agentResult.data?.isValid === true;
      claims.push({
        id: `claim_${Date.now()}_val`,
        statement: valid ? "Validation succeeded" : "Validation failed",
        source: "ValidationAgent",
        status: "unverified",
        payload: agentResult
      });
    }

    return claims;
  }
}
