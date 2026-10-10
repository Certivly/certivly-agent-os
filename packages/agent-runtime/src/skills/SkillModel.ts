export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  tags?: string[];
  tools?: string[];
  author?: string;
  parameters?: Record<string, { type: string; description?: string; required?: boolean }>;
}

export interface Skill {
  metadata: SkillMetadata;
  content: string; // Markdown body without frontmatter
  rawFile: string; // Full file content with frontmatter
  filePath: string;
  source: 'workspace' | 'user' | 'builtin';
}

export type SkillPatchOp = 'insert_after' | 'append_section' | 'replace_block' | 'delete_block';

export interface SkillPatch {
  op: SkillPatchOp;
  anchor?: string; // For insert_after
  targetText?: string; // For replace_block / delete_block
  content?: string; // For insert_after, append_section, replace_block
  rationale?: string;
}

export interface SkillOptimizationResult {
  skillName: string;
  baselinePassed: boolean;
  optimizedPassed: boolean;
  iterations: number;
  acceptedPatches: SkillPatch[];
  rejectedPatches: SkillPatch[];
  originalContent: string;
  finalContent: string;
  summary: string;
}

export interface MinedSkillCandidate {
  name: string;
  description: string;
  tags: string[];
  tools: string[];
  instructions: string;
  sourceSessionId: string;
  turnsCount: number;
}
