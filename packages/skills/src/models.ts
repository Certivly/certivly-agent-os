import { RepositoryGraphSnapshot } from '@agent-os/repository/src/models';
import { EventStore, RuntimeEvent } from '@agent-os/events';
import { WicerAPI } from '@agent-os/wicer';

export enum SkillLevel {
  READ = 'READ',
  ANALYZE = 'ANALYZE',
  TRANSFORM = 'TRANSFORM',
  EXECUTE = 'EXECUTE'
}

export interface SkillContext {
  repository: RepositoryGraphSnapshot;
  events: EventStore;
  wicer: WicerAPI;
  sessionId: string;
  requestId: string;
}

export interface SkillDependency {
  skillId: string;
  minVersion: number;
}

export interface SkillResult {
  success: boolean;
  data: any;
  events: RuntimeEvent[];
  wicerReferences: string[];
  graphReferences: string[];
}

export interface Skill {
  id: string;
  name: string;
  version: number;
  level: SkillLevel;
  inputSchema: object;
  outputSchema: object;
  requires: SkillDependency[];

  execute(ctx: SkillContext, input: any): Promise<SkillResult>;
}
