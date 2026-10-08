import { max } from './src/compare';

if (max(10, 5) !== 10) {
  console.error(`max(10, 5) failed: expected 10, got ${max(10, 5)}`);
  process.exit(1);
}

if (max(-3, -7) !== -3) {
  console.error(`max(-3, -7) failed: expected -3, got ${max(-3, -7)}`);
  process.exit(1);
}

if (max(42, 42) !== 42) {
  console.error(`max(42, 42) failed: expected 42, got ${max(42, 42)}`);
  process.exit(1);
}

console.log('Verification passed: max returns larger number.');
process.exit(0);
