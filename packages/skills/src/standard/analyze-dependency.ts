import { Skill, SkillLevel, SkillContext, SkillResult } from '../models';

export class AnalyzeDependencyChainSkill implements Skill {
  public id = 'agent-os.analyze.dependency-chain';
  public name = 'Analyze Dependency Chain';
  public version = 1;
  public level = SkillLevel.ANALYZE;
  public requires = [];

  public inputSchema = {
    type: 'object',
    properties: {
      fileId: { type: 'string' }
    },
    required: ['fileId']
  };

  public outputSchema = {
    type: 'object'
  };

  public async execute(ctx: SkillContext, input: { fileId: string }): Promise<SkillResult> {
    const unit = ctx.wicer.explainModule(input.fileId, ctx.repository);

    return {
      success: true,
      data: {
        fileId: input.fileId,
        moduleWikiId: unit.id
      },
      events: [],
      wicerReferences: [unit.id],
      graphReferences: unit.sourceGraphRefs
    };
  }
}
