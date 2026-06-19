import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class ConfigurationPatternDetector implements PatternDetector {
  public id = "detector-configuration-pattern";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const configFiles = graph?.nodes?.filter((n: any) => n.name && n.name.includes("config.json")) || [];
    
    if (configFiles.length > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.CONFIGURATION,
        title: "JSON Configuration",
        description: "Uses JSON for static configuration topologies",
        confidence: 0.9,
        occurrences: configFiles.length,
        evidence: [{ graphRefs: configFiles.map((e: any) => e.id), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
