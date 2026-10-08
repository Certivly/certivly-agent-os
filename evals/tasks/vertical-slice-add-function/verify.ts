import { add, multiply } from './src/math';

if (typeof multiply !== 'function') {
  console.error('multiply is not a function');
  process.exit(1);
}

if (multiply(3, 4) !== 12) {
  console.error(`multiply(3, 4) failed: expected 12, got ${multiply(3, 4)}`);
  process.exit(1);
}

if (add(2, 3) !== 5) {
  console.error(`add(2, 3) failed: expected 5, got ${add(2, 3)}`);
  process.exit(1);
}

console.log('Verification passed: multiply and add works correctly.');
process.exit(0);
