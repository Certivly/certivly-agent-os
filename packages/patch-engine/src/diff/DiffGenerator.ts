export class DiffGenerator {
  public generateUnifiedDiff(original: string, modified: string, filename: string): string {
    // Extremely simplistic deterministic diff generator for testing
    if (original === modified) return "";
    
    return `--- a/${filename}\n+++ b/${filename}\n- ${original.replace(/\n/g, "\n- ")}\n+ ${modified.replace(/\n/g, "\n+ ")}`;
  }
}
