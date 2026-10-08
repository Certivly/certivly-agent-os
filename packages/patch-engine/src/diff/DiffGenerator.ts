import { generateUnifiedDiff } from '@agent-os/shared';

export class DiffGenerator {
  public generateUnifiedDiff(original: string, modified: string, filename: string): string {
    return generateUnifiedDiff(original, modified, filename);
  }
}
