import { describe, it, expect, mock } from "bun:test";
import { AgentRouter } from "../src/AgentRouter";
import { AgentRole } from "../src/models";

describe("AgentRouter", () => {
  it("should route bug fixes to core 4 roles", () => {
    const router = new AgentRouter();
    const roles = router.route("Fix the bug in the login page");
    expect(roles).toEqual([AgentRole.CODER, AgentRole.TESTER, AgentRole.REVIEWER, AgentRole.SECURITY]);
  });

  it("should route readme requests to docs agent", () => {
    const router = new AgentRouter();
    const roles = router.route("Update the README with setup instructions");
    expect(roles).toEqual([AgentRole.DOCS]);
  });

  it("should route generic requests to all agents", () => {
    const router = new AgentRouter();
    const roles = router.route("Implement OAuth2 authentication");
    expect(roles).toEqual([
      AgentRole.ARCHITECT,
      AgentRole.CODER,
      AgentRole.TESTER,
      AgentRole.REVIEWER,
      AgentRole.SECURITY,
      AgentRole.DOCS
    ]);
  });
});
