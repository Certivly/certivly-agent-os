export function parseCsvLine(line: string): string[] {
  return line.split(',').map((s) => s.trim());
}
