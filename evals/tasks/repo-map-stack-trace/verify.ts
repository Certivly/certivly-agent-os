import { parseCsvLine } from './src/parser';

if (typeof parseCsvLine !== 'function') {
  console.error('parseCsvLine is not a function');
  process.exit(1);
}

const empty1 = parseCsvLine(null as any);
if (!Array.isArray(empty1) || empty1.length !== 0) {
  console.error('parseCsvLine(null) should return empty array');
  process.exit(1);
}

const empty2 = parseCsvLine(undefined as any);
if (!Array.isArray(empty2) || empty2.length !== 0) {
  console.error('parseCsvLine(undefined) should return empty array');
  process.exit(1);
}

const parsed = parseCsvLine('apple, banana, cherry');
if (parsed.length !== 3 || parsed[0] !== 'apple' || parsed[1] !== 'banana' || parsed[2] !== 'cherry') {
  console.error('parseCsvLine valid parsing failed');
  process.exit(1);
}

console.log('Verification passed: parseCsvLine handles null/undefined correctly.');
process.exit(0);
