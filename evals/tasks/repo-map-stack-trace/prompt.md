# Task: Stack Trace Investigation and Fix

Fix the TypeError thrown in `src/parser.ts` when `parseCsvLine(line?: string | null)` is passed null or undefined. It should return `[]` when input is null/undefined.
