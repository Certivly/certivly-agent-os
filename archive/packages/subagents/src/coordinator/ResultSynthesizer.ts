export interface FinalAgentResponse {
  summary: string;
  findings: string[];
  references: string[];
  metrics: {
    durationMs: number;
  };
}

export class ResultSynthesizer {
  public synthesize(results: any[]): FinalAgentResponse {
    let durationMs = 0;
    const findings: string[] = [];
    const references: string[] = [];

    for (const result of results) {
      if (result.durationMs) durationMs += result.durationMs;
      
      if (result.data?.files) {
        references.push(...result.data.files);
      }
      if (result.data?.patchPlan) {
        findings.push(...result.data.patchPlan);
      }
      if (result.data?.memories) {
        findings.push(...result.data.memories);
      }
    }

    return {
      summary: `Synthesized ${results.length} subagent outputs.`,
      findings,
      references,
      metrics: { durationMs }
    };
  }
}
