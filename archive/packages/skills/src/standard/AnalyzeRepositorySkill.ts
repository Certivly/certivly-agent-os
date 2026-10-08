import { Skill, SkillContext, SkillResult, SkillLevel } from '../models';

/**
 * AnalyzeRepositorySkill — READ-level skill that summarises the repository
 * structure from the RepositoryGraphSnapshot already loaded by the pipeline.
 * It requires no external calls; all data comes from the pre-built graph.
 */
export class AnalyzeRepositorySkill implements Skill {
  readonly id = 'AnalyzeRepositorySkill';
  readonly name = 'Analyze Repository';
  readonly version = 1;
  readonly level = SkillLevel.READ;
  readonly inputSchema = {};
  readonly outputSchema = {
    fileCount: 'number',
    symbolCount: 'number',
    languages: 'string[]',
    topDirectories: 'string[]'
  };
  readonly requires = [];

  public async execute(ctx: SkillContext, _input: any): Promise<SkillResult> {
    const graph = ctx.repository;
    const fileCount = graph.files.size;
    const symbolCount = graph.symbols.size;

    // Aggregate languages
    const langCount = new Map<string, number>();
    for (const [, file] of graph.files) {
      const lang = (file as any).language ?? 'unknown';
      langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
    }
    const languages = [...langCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang} (${count})`);

    // Top-level directories
    const dirCount = new Map<string, number>();
    for (const [, file] of graph.files) {
      const filePath: string = (file as any).path ?? '';
      const parts = filePath.split('/');
      if (parts.length > 1) {
        const topDir = parts[0];
        dirCount.set(topDir, (dirCount.get(topDir) ?? 0) + 1);
      }
    }
    const topDirectories = [...dirCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([dir, count]) => `${dir}/ (${count} files)`);

    const summary = {
      fileCount,
      symbolCount,
      languages,
      topDirectories
    };

    return {
      success: true,
      data: summary,
      events: [],
      wicerReferences: [],
      graphReferences: [...graph.files.keys()].slice(0, 5),
      narrativeHints: {
        activity: `Analyzed ${fileCount} files across ${langCount.size} languages`,
        phase: 'ANALYSIS'
      }
    };
  }
}
