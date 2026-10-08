import { SkillRegistry } from "@agent-os/skills";

export class SkillResolver {
  constructor(private registry: SkillRegistry) {}

  public resolveRequiredSkills(goal: string, requiredTypes: string[]): string[] {
    // Queries the @agent-os/skills registry dynamically.
    const resolved: string[] = [];
    const allSkills = this.registry.listSkills();

    for (const req of requiredTypes) {
      // Very basic resolution - in a real scenario this might use SEOL or Memory 
      // to map generic task requirements to exact skill IDs.
      const match = allSkills.find(s => s.id === req || s.name.toLowerCase().includes(req.toLowerCase()));
      if (match) {
        resolved.push(match.id);
      }
    }

    return resolved;
  }
}
