import { Convention } from "../models/Convention";

export class ConventionExtractor {
  // Deterministic rule-based extraction
  public extractNamingConventions(files: string[]): Convention[] {
    const componentRegex = /^[A-Z][a-zA-Z0-9]*\.tsx?$/; // PascalCase
    const hookRegex = /^use[A-Z][a-zA-Z0-9]*\.ts$/;      // camelCase
    
    let pascalComponents = 0;
    let camelHooks = 0;
    const pascalEvidence: string[] = [];
    const camelEvidence: string[] = [];

    for (const file of files) {
      const parts = file.split("/");
      const filename = parts[parts.length - 1];

      if (componentRegex.test(filename)) {
        pascalComponents++;
        pascalEvidence.push(file);
      }
      if (hookRegex.test(filename)) {
        camelHooks++;
        camelEvidence.push(file);
      }
    }

    const conventions: Convention[] = [];

    if (pascalComponents >= 5) {
      conventions.push({
        id: `conv_naming_pascal_${pascalComponents}`,
        type: "naming",
        pattern: "PascalCase for Components",
        confidence: 0.9,
        evidenceCount: pascalComponents,
        evidence: pascalEvidence.slice(0, 5) // keep it bounded
      });
    }

    if (camelHooks >= 5) {
      conventions.push({
        id: `conv_naming_camel_${camelHooks}`,
        type: "naming",
        pattern: "useCamelCase for Hooks",
        confidence: 0.9,
        evidenceCount: camelHooks,
        evidence: camelEvidence.slice(0, 5)
      });
    }

    return conventions;
  }
}
