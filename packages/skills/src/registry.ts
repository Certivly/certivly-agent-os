import { Skill } from './models';

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  public register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill ${skill.id} already registered`);
    }
    this.skills.set(skill.id, skill);
  }

  public get(id: string): Skill {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill ${id} not found in registry`);
    return skill;
  }

  public validateDependencies(skill: Skill): void {
    for (const dep of skill.requires) {
      const target = this.skills.get(dep.skillId);
      if (!target) throw new Error(`Missing dependency: ${dep.skillId} for skill ${skill.id}`);
      if (target.version < dep.minVersion) {
        throw new Error(`Version mismatch: ${dep.skillId} requires >= ${dep.minVersion}, but got ${target.version}`);
      }
    }
  }

  public resolveExecutionOrder(targetSkillId: string): Skill[] {
    const target = this.get(targetSkillId);
    const order: Skill[] = [];
    const visited = new Set<string>();

    const visit = (skill: Skill) => {
      if (visited.has(skill.id)) return;
      visited.add(skill.id);
      
      this.validateDependencies(skill);
      for (const dep of skill.requires) {
        visit(this.get(dep.skillId));
      }
      order.push(skill);
    };

    visit(target);
    return order;
  }
}
