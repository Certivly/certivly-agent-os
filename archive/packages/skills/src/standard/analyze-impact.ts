import { Skill, SkillLevel, SkillContext, SkillResult } from '../models';

export class AnalyzeImpactRadiusSkill implements Skill {
  public id = 'agent-os.analyze.impact-radius';
  public name = 'Analyze Impact Radius';
  public version = 1;
  public level = SkillLevel.ANALYZE;
  public requires = [];

  public inputSchema = {
    type: 'object',
    properties: {
      targetId: { type: 'string' },
      targetType: { type: 'string', enum: ['file', 'symbol'] }
    },
    required: ['targetId', 'targetType']
  };

  public outputSchema = {
    type: 'object',
    properties: {
      impactedFilesCount: { type: 'number' },
      impactedSymbolsCount: { type: 'number' },
      cascadeChain: { type: 'array', items: { type: 'string' } }
    }
  };

  public async execute(ctx: SkillContext, input: { targetId: string, targetType: 'file' | 'symbol' }): Promise<SkillResult> {
    // Phase 5 explicitly requires skills to use WiCER for tracing and analysis where possible,
    // though WiCER output is text, we can use the API directly since WicerAPI exposes `explainImpact`
    
    // Actually, `wicer.explainImpact` returns the KnowledgeUnit.
    // The knowledge unit has all the data we need.
    const unit = ctx.wicer.explainImpact(input.targetId, input.targetType, ctx.repository);

    // Parse the textual outcome from WiCER or use graph references.
    // The impact unit sourceGraphRefs contain the target and all dependencies.
    // To conform to structured output without hacking strings, we can count the refs.
    const fileRefs = unit.sourceGraphRefs.filter(ref => !ref.includes('#'));
    const symbolRefs = unit.sourceGraphRefs.filter(ref => ref.includes('#'));

    return {
      success: true,
      data: {
        impactedFilesCount: fileRefs.length,
        impactedSymbolsCount: symbolRefs.length,
        cascadeChain: unit.content.split('\n').filter(l => l.startsWith('Level '))
      },
      events: [],
      wicerReferences: [unit.id],
      graphReferences: unit.sourceGraphRefs
    };
  }
}
